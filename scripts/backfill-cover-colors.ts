/**
 * One-time backfill script: Extract dominant colors from existing cover images
 * and store them in the Work.coverColors field.
 *
 * Usage: npx tsx scripts/backfill-cover-colors.ts
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@bookhouse/db";
import { extractDominantColors } from "@bookhouse/ingest";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

async function main() {
  const works = await db.work.findMany({
    where: { coverPath: { not: null }, coverColors: { equals: null } },
    select: { id: true, coverPath: true },
  });

  console.log(`Found ${String(works.length)} works with covers but no colors`);

  let processed = 0;
  let failed = 0;

  for (const work of works) {
    try {
      const mediumPath = path.join(COVER_CACHE_DIR, work.coverPath as string, "medium.webp");
      const imageBuffer = await readFile(mediumPath);
      const colors = await extractDominantColors(imageBuffer, sharp as never);

      await db.work.update({
        where: { id: work.id },
        data: { coverColors: colors },
      });

      processed++;
      if (processed % 100 === 0) {
        console.log(`  Processed ${String(processed)}/${String(works.length)}...`);
      }
    } catch {
      failed++;
    }
  }

  console.log(`Done. Processed: ${String(processed)}, Failed: ${String(failed)}`);
  await db.$disconnect();
}

void main();
