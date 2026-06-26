/**
 * Diagnostic: surfaces orphaned / dangling rows that accumulate from interrupted
 * scans, move detection, and nullable foreign keys. Read-only — it never mutates.
 *
 * Run with:
 *   pnpm --filter @bookhouse/web exec tsx ../../scripts/detect-orphans.ts
 *
 * Pass `--strict` to exit non-zero when any orphans are found (useful as a
 * scheduled health check). The default exit code is 0.
 *
 * What it reports:
 *  - MISSING FileAssets with no EditionFile links — dead rows left by failed
 *    deletes or pre-fix move detection. These are safe to cascade-clean.
 *  - PRESENT FileAssets with no EditionFile links — files on disk that never got
 *    linked to an edition (a stalled ingest, or a genuine orphan).
 *  - Editions with no EditionFile links — editions whose every file is gone.
 *  - Collections with a null ownerUserId — unowned collections (nullable FK).
 *  - ReadingProgress whose editionId resolves to no Edition — should be
 *    impossible (FK + ON DELETE CASCADE); a non-zero count means corruption.
 */
import { db } from "@bookhouse/db";

const SAMPLE = 10;

interface Finding {
  label: string;
  count: number;
  sampleIds: string[];
  note?: string;
}

async function main(): Promise<void> {
  const strict = process.argv.includes("--strict");
  const findings: Finding[] = [];

  const missingNoLinks = await db.fileAsset.findMany({
    where: { availabilityStatus: "MISSING", editionFiles: { none: {} } },
    select: { id: true, absolutePath: true },
    take: SAMPLE,
  });
  const missingNoLinksCount = await db.fileAsset.count({
    where: { availabilityStatus: "MISSING", editionFiles: { none: {} } },
  });
  findings.push({
    label: "MISSING FileAssets with no EditionFile links",
    count: missingNoLinksCount,
    sampleIds: missingNoLinks.map((f) => `${f.id} (${f.absolutePath})`),
    note: "Safe to cascade-clean (cleanupOrphanedFileAssets).",
  });

  const presentNoLinksCount = await db.fileAsset.count({
    where: { availabilityStatus: "PRESENT", editionFiles: { none: {} } },
  });
  const presentNoLinks = await db.fileAsset.findMany({
    where: { availabilityStatus: "PRESENT", editionFiles: { none: {} } },
    select: { id: true, absolutePath: true },
    take: SAMPLE,
  });
  findings.push({
    label: "PRESENT FileAssets with no EditionFile links",
    count: presentNoLinksCount,
    sampleIds: presentNoLinks.map((f) => `${f.id} (${f.absolutePath})`),
    note: "Expected transiently mid-scan; persistent rows are stalled ingests.",
  });

  const editionsNoFilesCount = await db.edition.count({
    where: { editionFiles: { none: {} } },
  });
  const editionsNoFiles = await db.edition.findMany({
    where: { editionFiles: { none: {} } },
    select: { id: true, workId: true },
    take: SAMPLE,
  });
  findings.push({
    label: "Editions with no EditionFile links",
    count: editionsNoFilesCount,
    sampleIds: editionsNoFiles.map((e) => `${e.id} (work ${e.workId})`),
    note: "May be intentional metadata-only editions; verify before deleting.",
  });

  const unownedCollectionsCount = await db.collection.count({
    where: { ownerUserId: null },
  });
  const unownedCollections = await db.collection.findMany({
    where: { ownerUserId: null },
    select: { id: true, name: true },
    take: SAMPLE,
  });
  findings.push({
    label: "Collections with a null ownerUserId",
    count: unownedCollectionsCount,
    sampleIds: unownedCollections.map((c) => `${c.id} (${c.name})`),
    note: "Unowned collections; assign an owner or remove.",
  });

  const danglingProgress = await db.$queryRaw<{ id: string }[]>`
    SELECT rp."id"
    FROM "ReadingProgress" rp
    LEFT JOIN "Edition" e ON e."id" = rp."editionId"
    WHERE e."id" IS NULL
    LIMIT ${SAMPLE}
  `;
  findings.push({
    label: "ReadingProgress rows with no matching Edition",
    count: danglingProgress.length,
    sampleIds: danglingProgress.map((r) => r.id),
    note: "Should be 0 (FK + ON DELETE CASCADE). Non-zero implies corruption.",
  });

  let totalOrphans = 0;
  console.log("Orphan / dangling-row report\n");
  for (const f of findings) {
    totalOrphans += f.count;
    console.log(`${f.count === 0 ? "✓" : "✗"} ${f.label}: ${f.count}`);
    if (f.note) console.log(`    note: ${f.note}`);
    for (const id of f.sampleIds) {
      console.log(`    - ${id}`);
    }
    if (f.count > f.sampleIds.length) {
      console.log(`    … and ${f.count - f.sampleIds.length} more`);
    }
    console.log("");
  }

  console.log(`Total orphaned/dangling rows: ${totalOrphans}`);
  await db.$disconnect();

  if (strict && totalOrphans > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
