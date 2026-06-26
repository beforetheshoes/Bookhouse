# Bookhouse Data Model

This document describes the operational shape of the database: how rows relate,
what deleting something cascades to, where nullable foreign keys hide, how reader
progress is owned, and the rules that keep the sync and scan paths from throwing
on stale data. It is a companion to `packages/db/prisma/schema.prisma` — the
schema is the source of truth for columns; this file is the source of truth for
*why* the relationships are shaped the way they are.

## Entity overview

The library is a four-level hierarchy plus per-user state:

```
LibraryRoot ──< FileAsset ──< EditionFile >── Edition >── Work >── Series
                                                  │          │
                                  Contributor >── EditionContributor
                                                             │
   User ──< ReadingProgress >────────────────────── Edition │
   User ──< Collection ──< CollectionItem >── Edition        │
   User ──< KoboDevice ──< KoboDeviceCollection >── Collection
                       └──< KoboSyncedBook >── Edition
   Work ──< MatchSuggestion >── Work   (audiobook ↔ ebook linking suggestions)
```

- **LibraryRoot** — a scanned directory on disk.
- **FileAsset** — one physical file under a root (hashes, `availabilityStatus`).
- **Work** — the abstract book (title/author identity); the merge target.
- **Edition** — a concrete manifestation of a Work (format family, ISBN, ASIN).
- **EditionFile** — the join between an Edition and the FileAsset(s) backing it.
- **Contributor / EditionContributor** — authors/narrators and their roles.

`FileAsset → EditionFile → Edition → Work` is the spine. A scan creates
FileAssets; ingest links them to stub Editions/Works; enrichment fills metadata
and `MatchSuggestion` proposes audio↔ebook links for review.

## Cascade trees (what a delete removes)

Almost every child relation is `onDelete: Cascade`. Deleting a row deletes the
subtree beneath it. The important roots:

- **Delete a `User`** → their `UserIdentity`, `UserRole`, `ReadingProgress`,
  `UserPreference`, `WorkProgressPreference`, `Collection` (owned),
  `KoboDevice`, `OpdsCredential`, `KoreaderCredential`.
- **Delete a `LibraryRoot`** → its `FileAsset`s → their `EditionFile`s. The
  Editions/Works themselves are **not** cascaded from the root; an Edition that
  loses its last `EditionFile` becomes file-less (see "orphans" below).
- **Delete a `Work`** → its `Edition`s → each Edition's `EditionFile`s,
  `EditionContributor`s, `CollectionItem`s, `ReadingProgress`, `KoboSyncedBook`s,
  plus the Work's `MatchSuggestion`s and `WorkTag`s.
- **Delete an `Edition`** → its `EditionFile`s, `EditionContributor`s,
  `CollectionItem`s, `ReadingProgress`, `KoboSyncedBook`s.
- **Delete a `FileAsset`** → its `EditionFile`s. (This is the move-detection
  cleanup path: the moved-from FileAsset is deleted once its links transfer.)

`cascadeCleanupOrphans` in `packages/ingest/src/cascade-cleanup.ts` walks this
tree deliberately in application code (delete EditionFiles → editions with no
files → works with no editions) rather than relying solely on DB cascades, so
the scan can clean stub rows it created.

## Nullable foreign keys and `SET NULL` edges

These are the only non-cascade / nullable references. Each encodes a real state,
so reads must tolerate the null:

| Column | On delete | Null means |
| --- | --- | --- |
| `Collection.ownerUserId` | CASCADE (but nullable) | Unowned / system collection. A non-null owner cascades; a null owner persists. |
| `ImportJob.libraryRootId` | **SET NULL** | A standalone batch job not tied to one root (e.g. a bulk enrich), or whose root was deleted. |
| `Work.seriesId` | **SET NULL** | Work not in a series, or its series was deleted. |
| `DuplicateCandidate.{left,right}EditionId` | **SET NULL** | One side of a duplicate pair was deleted; the candidate row survives with a dangling side. |
| `DuplicateCandidate.{left,right}FileAssetId` | **SET NULL** | As above for file-level duplicates. |
| `ExternalLink.{editionId,workId}` | CASCADE (both nullable) | A link attached to either an edition or a work (exactly one is typically set). |

**Hazard:** `ImportJob` and `DuplicateCandidate` can outlive the entity they
point at via `SET NULL`. Queries that join through these must handle the null and
not assume a row is present. `scripts/detect-orphans.ts` reports the
`ownerUserId IS NULL` collections so they don't silently accumulate.

## Reading-progress ownership (per-source positions)

`ReadingProgress` is uniquely keyed on **`[userId, editionId, progressKind, source]`**
(`@@unique`). `progressKind` ∈ {`EBOOK`, `AUDIO`, `READALOUD`}; `source` ∈
{`manual`, `kobo`, `koreader`} and is `NOT NULL DEFAULT 'manual'`.

Including `source` in the key is deliberate: **each reader keeps its own
position.** A Kobo's furthest-read page and a KOReader position for the same
ebook are distinct rows and do not clobber each other. Consequences:

- Every progress writer upserts on the full four-part key:
  - Kobo — `apps/web/server/routes/kobo/[token]/v1/library/[bookId]/state.ts`
    (`source: "kobo"`, `progressKind: "EBOOK"`).
  - KOReader — `apps/web/server/routes/api/koreader/syncs/progress.ts`
    (`source: "koreader"`).
  - Manual / UI — `apps/web/src/lib/server-fns/reading-progress.ts`
    (`source: "manual"`).
- A reader reads back **only its own** source row. The UI surfaces the manual
  row; merging positions across sources is an explicit product decision, not an
  accidental side effect of a shared key.

The migration `20260625130000_reading_progress_unique_source` backfilled
`source` (null → `manual`), de-duplicated existing rows (keeping the newest per
tuple), set the column `NOT NULL`, then added the unique index — in that order,
because a uniqueness constraint fails if duplicates exist first.

## Stale-entity rule: skip silently, never throw

Sync surfaces accept entity ids **supplied by a remote device** and write rows
that reference them. Between the device reading an id and us writing, the row can
be deleted. A naive write then raises a Postgres `P2003` foreign-key error and
500s the device mid-sync.

**Rule: a write that references a since-deleted entity is acknowledged and
skipped, never thrown.** Two complementary mechanisms:

1. **Pre-check** with the FK guards in `packages/db/src/guards.ts`
   (`editionExists` / `assertEditionExists`). The Kobo `state` route checks
   `editionExists(db, bookId)` and returns success-without-write when the edition
   is gone.
2. **Catch P2003** at the write with `isForeignKeyConstraintError` from
   `packages/shared/src/errors.ts`, for the narrow read-then-write race that a
   pre-check can't fully close (Kobo `markSynced`, KOReader `upsertProgress`).

The same applies to background workers: a BullMQ job for a deleted entity must
skip silently and succeed, never throw (see `feedback_stale_jobs`).

## Scan & move-detection invariants

- **One FileAsset per absolute path.** Scans upsert FileAssets by
  `absolutePath`, so re-scanning is idempotent at the file level.
- **Move detection re-links instead of duplicating.** When a previously-`MISSING`
  FileAsset's content hash reappears at a new path, the scan transfers the
  `EditionFile` links from the MISSING asset to the present one. It transfers
  from the first MISSING match **that actually has edition links**, skipping
  link-less orphans that happen to share the hash.
- **Moved-from cleanup.** After a hash job reports `movedFromFileAssetId`, the
  worker (`workers/library-worker/src/index.ts`) cascade-cleans that orphaned
  source asset so dead `MISSING` rows don't accumulate and can't confuse future
  move detection.
- **No silently dropped files.** A file that fails to `stat` during the walk is
  logged ("Failed to stat entry"), not silently skipped, so a previously-PRESENT
  file that errors isn't quietly left stale.
- **One active scan per root.** `scanLibraryRootServerFn`
  (`apps/web/src/lib/server-fns/library-roots.ts`) refuses to start a second
  scan of a root while a `SCAN_ROOT` ImportJob for it is `QUEUED`/`RUNNING`,
  returning the in-flight job (`alreadyRunning: true`). This prevents two scans
  racing through discovery and each creating stub Works for the same file. Only a
  *live* scan blocks: the check ignores ghost scans (an ImportJob stuck
  `QUEUED`/`RUNNING` because the worker crashed) by requiring `updatedAt` within
  `STALE_SCAN_THRESHOLD_MS` (5 min), matching the reaping in
  `getActiveJobCountServerFn` — so a dead scan can never permanently block
  re-scans. It is a best-effort check: a pair of exactly-simultaneous requests is
  bounded but not fully serialised (there is no scheduled/automatic scan path, so
  the realistic trigger is a manual re-click or an overlapping retry).

`scripts/detect-orphans.ts` is the read-only health check for the rows these
invariants are meant to prevent (MISSING/PRESENT FileAssets with no links,
file-less Editions, unowned Collections, dangling ReadingProgress). Run it with
`--strict` to exit non-zero when anything is found.

## Migrations: safety rules

- **Never `prisma migrate dev` or `migrate reset` against a database with real
  data** (the NAS). They can wipe it. Author migrations only against a disposable
  local DB; apply to the NAS with **`prisma migrate deploy`** (applies pending
  migrations only, no shadow DB, no reset) after explicit owner sign-off.
- **Constraint migrations need a backfill/dedup step first**, or the deploy fails
  on existing data (see the reading-progress migration above).

### `prisma migrate dev` is currently broken repo-wide

`migrate dev` replays the full migration history into a shadow database to detect
drift. The historical migration
`20260402120000_add_amazon_ebook_media_kinds` adds a new enum value (`MOBI`) and
uses it **within the same transaction**, which Postgres rejects on shadow replay
("unsafe use of new value of enum type"). This makes `migrate dev` fail before it
can author anything.

This **cannot be fixed by editing the offending migration**: it is already
applied on the NAS, and changing applied migration SQL breaks the checksum that
`migrate deploy` verifies, which would then refuse to deploy. The migration is
correct as deployed — only the shadow-replay path is unhappy.

**Workaround — author migrations by diffing, not by `migrate dev`:**

```sh
# from packages/db, with a LOCAL DATABASE_URL (never the NAS)
pnpm exec prisma migrate diff \
  --from-config-datasource ./prisma.config.ts \
  --to-schema ./prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql
# review by hand, then:
pnpm exec prisma migrate deploy
```

`migrate diff` between the live datasource and the schema does **not** use a
shadow DB, so it is unaffected by the MOBI issue. An empty diff
(`-- This is an empty migration.`) confirms the DB matches the schema.

### Diagnostics

```sh
# user/role state
pnpm --filter @bookhouse/web exec tsx ../../scripts/check-user-roles.ts
# Kobo device → shelf → edition chain
pnpm --filter @bookhouse/web exec tsx ../../scripts/check-kobo-sync.ts
# orphaned / dangling rows (add --strict for a non-zero exit on findings)
pnpm --filter @bookhouse/web exec tsx ../../scripts/detect-orphans.ts
# confirm DB matches schema (empty output = in sync)
cd packages/db && pnpm exec prisma migrate diff \
  --from-config-datasource ./prisma.config.ts --to-schema ./prisma/schema.prisma --script
```
