/**
 * One-time backfill script: Populate sortTitle on works and nameSort on contributors.
 *
 * - Sets Work.sortTitle using generateSortTitle(titleDisplay) where sortTitle IS NULL
 *   and "sortTitle" is not in editedFields (user hasn't manually set it).
 * - Sets Contributor.nameSort using generateNameSort(nameDisplay) where nameSort IS NULL.
 *
 * Usage: npx tsx scripts/backfill-sort-keys.ts
 */

import { db } from "@bookhouse/db";
import { generateSortTitle, generateNameSort } from "@bookhouse/ingest";

async function main() {
  // Backfill Work.sortTitle
  const works = await db.work.findMany({
    where: { sortTitle: null },
    select: { id: true, titleDisplay: true, editedFields: true },
  });

  const worksToUpdate = works.filter(
    (w) => !w.editedFields.includes("sortTitle"),
  );

  console.log(
    `Found ${String(works.length)} works with null sortTitle (${String(worksToUpdate.length)} eligible for backfill)`,
  );

  let workUpdated = 0;
  for (const work of worksToUpdate) {
    await db.work.update({
      where: { id: work.id },
      data: { sortTitle: generateSortTitle(work.titleDisplay) },
    });
    workUpdated++;
  }

  console.log(`Updated ${String(workUpdated)} works`);

  // Backfill Contributor.nameSort
  const contributors = await db.contributor.findMany({
    where: { nameSort: null },
    select: { id: true, nameDisplay: true },
  });

  console.log(`Found ${String(contributors.length)} contributors with null nameSort`);

  let contribUpdated = 0;
  for (const contrib of contributors) {
    await db.contributor.update({
      where: { id: contrib.id },
      data: { nameSort: generateNameSort(contrib.nameDisplay) },
    });
    contribUpdated++;
  }

  console.log(`Updated ${String(contribUpdated)} contributors`);
  console.log("Backfill complete");
}

main()
  .catch(console.error)
  .finally(() => {
    void db.$disconnect();
  });
