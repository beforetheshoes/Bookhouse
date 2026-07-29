/**
 * One-time backfill script: Populate sortTitle on works and nameSort on contributors.
 *
 * - Sets Work.sortTitle using generateSortTitle(titleDisplay) where sortTitle IS NULL
 *   and "sortTitle" is not in editedFields (user hasn't manually set it).
 * - Recomputes Contributor.nameSort using generateNameSort(nameDisplay) for every
 *   contributor, writing only the rows whose key changes. Idempotent, and safe
 *   to re-run whenever generateNameSort changes.
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

  // Backfill Contributor.nameSort. Every row is recomputed, not just the null
  // ones: names carrying a comma or a credential were previously filed under
  // the wrong word, so a null-only pass would leave those wrong values in
  // place. Only rows whose key actually changes are written, so this is
  // idempotent and safe to re-run after any generateNameSort change.
  const contributors = await db.contributor.findMany({
    select: { id: true, nameDisplay: true, nameSort: true },
  });

  const contribToUpdate = contributors
    .map((c) => ({ ...c, nextNameSort: generateNameSort(c.nameDisplay) }))
    .filter((c) => c.nameSort !== c.nextNameSort);

  const nullCount = contribToUpdate.filter((c) => c.nameSort === null).length;
  console.log(
    `Found ${String(contributors.length)} contributors; ${String(contribToUpdate.length)} need updating ` +
      `(${String(nullCount)} null, ${String(contribToUpdate.length - nullCount)} incorrect)`,
  );

  let contribUpdated = 0;
  for (const contrib of contribToUpdate) {
    await db.contributor.update({
      where: { id: contrib.id },
      data: { nameSort: contrib.nextNameSort },
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
