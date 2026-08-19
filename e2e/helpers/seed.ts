import { db } from "@bookhouse/db";

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("_test")) {
    throw new Error(
      `SAFETY: Refusing to clean database. DATABASE_URL must point to a "_test" database ` +
      `to prevent accidental data loss. Current URL: "${url}"`,
    );
  }
}

export async function cleanDatabase() {
  assertTestDatabase();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "ImportJob",
                   "DuplicateCandidate",
                   "MatchSuggestion",
                   "ExternalLink",
                   "ReadingProgress",
                   "WorkProgressPreference",
                   "UserPreference",
                   "CollectionItem",
                   "Collection",
                   "EditionContributor",
                   "EditionFile",
                   "Contributor",
                   "Edition",
                   "Work",
                   "Series",
                   "FileAsset",
                   "LibraryRoot",
                   "UserRole",
                   "UserIdentity",
                   "User"
    CASCADE
  `);
}

/**
 * Cleans test-specific data (library roots, works, jobs, etc.) while
 * preserving the authenticated user so session cookies remain valid
 * across tests in the same run.
 */
export async function cleanTestData() {
  assertTestDatabase();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "ImportJob",
                   "DuplicateCandidate",
                   "MatchSuggestion",
                   "ExternalLink",
                   "ReadingProgress",
                   "WorkProgressPreference",
                   "UserPreference",
                   "CollectionItem",
                   "Collection",
                   "EditionContributor",
                   "EditionFile",
                   "Contributor",
                   "Edition",
                   "Work",
                   "Series",
                   "FileAsset",
                   "LibraryRoot"
    CASCADE
  `);
}

export async function seedLibraryRoot(
  overrides: {
    name?: string;
    path?: string;
    kind?: "EBOOKS" | "AUDIOBOOKS" | "MIXED";
    scanMode?: "FULL" | "INCREMENTAL";
  } = {},
) {
  return db.libraryRoot.create({
    data: {
      name: overrides.name ?? "E2E Test Library",
      path: overrides.path ?? "/tmp/e2e-test-library",
      kind: overrides.kind ?? "EBOOKS",
      scanMode: overrides.scanMode ?? "FULL",
    },
  });
}

export async function seedWork(overrides: { title?: string } = {}) {
  const title = overrides.title ?? "E2E Test Book";

  // Ensure a library root exists for the file asset foreign key
  const libraryRoot = await db.libraryRoot.upsert({
    where: { path: "/tmp/e2e-seed-library" },
    create: {
      name: "E2E Seed Library",
      path: "/tmp/e2e-seed-library",
      kind: "EBOOKS",
      scanMode: "FULL",
    },
    update: {},
  });

  const slug = title.toLowerCase().replace(/\s+/g, "-");

  return db.work.create({
    data: {
      titleCanonical: title.toLowerCase(),
      titleDisplay: title,
      sortTitle: title.toLowerCase(),
      editions: {
        create: {
          formatFamily: "EBOOK",
          editionFiles: {
            create: {
              role: "PRIMARY",
              fileAsset: {
                create: {
                  libraryRootId: libraryRoot.id,
                  absolutePath: `/tmp/e2e-seed-library/${slug}.epub`,
                  relativePath: `${slug}.epub`,
                  basename: `${slug}.epub`,
                  extension: "epub",
                  mediaKind: "EPUB",
                  availabilityStatus: "PRESENT",
                },
              },
            },
          },
        },
      },
    },
    include: { editions: true },
  });
}

export async function seedImportJob(
  libraryRootId: string,
  overrides: {
    kind?: "SCAN_ROOT" | "HASH_FILE" | "PARSE_FILE" | "DETECT_DUPLICATES" | "MATCH_SUGGESTIONS";
    status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  } = {},
) {
  return db.importJob.create({
    data: {
      libraryRootId,
      kind: overrides.kind ?? "SCAN_ROOT",
      status: overrides.status ?? "SUCCEEDED",
      startedAt: new Date(Date.now() - 30_000),
      finishedAt:
        overrides.status === "RUNNING" ? undefined : new Date(),
      attemptsMade: 1,
    },
  });
}

export async function findE2EUser() {
  return db.user.findFirst({
    where: { email: "e2e@bookhouse.test" },
  });
}

/**
 * A shelf (backed by Collection) owned by the e2e user, containing the given
 * editions. Needed by any test that has to reach a shelf DETAIL page — the
 * shelves index alone renders no selection UI.
 */
export async function seedShelf(
  overrides: { name?: string; editionIds?: string[] } = {},
) {
  const owner = await findE2EUser();
  const shelf = await db.collection.create({
    data: {
      name: overrides.name ?? "E2E Shelf",
      kind: "MANUAL",
      ...(owner ? { ownerUserId: owner.id } : {}),
    },
  });
  for (const editionId of overrides.editionIds ?? []) {
    await db.collectionItem.create({ data: { collectionId: shelf.id, editionId } });
  }
  return shelf;
}

/**
 * A work attached to a long-named series, in a long-named library root.
 *
 * Both shapes reach the UI through Badge and SelectTrigger, which size to
 * their content: a long series name overflowed work detail to 535px and a long
 * root name overflowed /upload to 601px while the suite was green on tidy data.
 */
export async function seedHostileWork() {
  const root = await db.libraryRoot.upsert({
    where: { path: "/mnt/media/books/calibre-library-with-a-long-path" },
    create: {
      name: "Downstairs Calibre Library Including Audiobooks And Comics",
      path: "/mnt/media/books/calibre-library-with-a-long-path",
      kind: "EBOOKS",
      scanMode: "FULL",
    },
    update: {},
  });
  const series = await db.series.create({
    data: { name: "The Extremely Long Chronicles Of A Series Name That Will Not Fit" },
  });
  const work = await seedWork({
    // The trailing token has no break opportunity. Long names *with spaces*
    // wrap on their own; it takes an unbreakable run to set the page width,
    // which is how the breadcrumb and heading overflows survived several
    // rounds of "long name" fixtures.
    title:
      "A Genuinely Very Long Book Title That Keeps Going Past What Any Card Holds " +
      "Untitled_Manuscript_Draft_Seventeen_Final_Revised_v2",
  });
  await db.work.update({
    where: { id: work.id },
    data: {
      seriesId: series.id,
      seriesPosition: 1,
      // A URL and an underscore path are the shapes that actually set the page
      // width: neither offers a break opportunity, so a read-mode field with
      // the wrong overflow-wrap value renders at their full min-content width.
      description:
        "See https://example.com/a/very/long/reference/path/that/never/breaks?with=query&and=more " +
        "or /mnt/media/books/some_long_underscore_separated_file_name_here.epub",
    },
  });
  return { work, series, root };
}
