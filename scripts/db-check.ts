import { db } from "../packages/db/src/index.js";

async function main() {
  const counts = await db.$queryRawUnsafe(
    'SELECT status, count(*)::int as count FROM "ImportJob" GROUP BY status',
  );
  console.log("Jobs by status:", counts);

  const total = await db.importJob.count();
  console.log("Total jobs:", total);

  const works = await db.work.count();
  console.log("Total works:", works);

  const roots = await db.libraryRoot.findMany({
    select: { id: true, name: true, path: true },
  });
  console.log("Library roots:", roots);

  await db.$disconnect();
}

void main();
