import { db } from "../packages/db/src/index.js";

async function main() {
  const fileCount = await db.fileAsset.count();
  console.log("Total file assets:", fileCount);

  const byStatus = await db.$queryRawUnsafe(
    'SELECT "availabilityStatus", count(*)::int as count FROM "FileAsset" GROUP BY "availabilityStatus"',
  );
  console.log("Files by status:", byStatus);

  const editions = await db.edition.count();
  console.log("Total editions:", editions);

  const works = await db.work.count();
  console.log("Total works:", works);

  const sample = await db.fileAsset.findMany({
    take: 5,
    select: { id: true, basename: true, availabilityStatus: true, fullHash: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("Recent files:", sample);

  await db.$disconnect();
}

main();
