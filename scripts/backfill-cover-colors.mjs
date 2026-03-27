/**
 * One-time backfill: Extract dominant colors from existing cover images.
 * Usage: node scripts/backfill-cover-colors.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "packages/ingest/package.json"));
const sharp = require("sharp");

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

// Inline the color extraction logic (avoids TS import issues)
function rgbToHex(r, g, b) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function clusterColors(pixels, k) {
  if (pixels.length === 0) return [];
  const centroids = [pixels[0]];
  while (centroids.length < k) {
    let maxDist = -1, best = pixels[0];
    for (const px of pixels) {
      const minD = Math.min(...centroids.map(c => colorDistance(px, c)));
      if (minD > maxDist) { maxDist = minD; best = px; }
    }
    centroids.push(maxDist <= 0 ? centroids[0] : best);
  }
  const clusters = centroids.map(() => []);
  for (const px of pixels) {
    let minIdx = 0, minD = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const d = colorDistance(px, centroids[i]);
      if (d < minD) { minD = d; minIdx = i; }
    }
    clusters[minIdx].push(px);
  }
  return clusters.map(cl => {
    if (cl.length === 0) return centroids[0];
    const sum = cl.reduce((a, p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0,0,0]);
    return [Math.round(sum[0]/cl.length), Math.round(sum[1]/cl.length), Math.round(sum[2]/cl.length)];
  });
}

async function extractColors(imageBuffer) {
  const dominant = await sharp(imageBuffer).resize(1, 1).toColorspace("srgb").raw().toBuffer();
  const palette = await sharp(imageBuffer).resize(8, 8).toColorspace("srgb").raw().toBuffer();
  const pixels = [];
  for (let i = 0; i < palette.length; i += 3) {
    pixels.push([palette[i], palette[i+1], palette[i+2]]);
  }
  const clusters = clusterColors(pixels, 3);
  const dr = dominant[0] ?? 128, dg = dominant[1] ?? 128, db = dominant[2] ?? 128;
  const colors = clusters.length >= 3 ? clusters : [[dr,dg,db],[dr,dg,db],[dr,dg,db]];
  colors.sort((a, b) => luminance(a[0],a[1],a[2]) - luminance(b[0],b[1],b[2]));
  return colors.map(([r,g,b]) => rgbToHex(r,g,b));
}

async function main() {
  // Dynamic import of Prisma client
  const { db } = await import("@bookhouse/db");

  // Prisma JSON null requires special handling: use raw filter
  const works = await db.work.findMany({
    where: { coverPath: { not: null } },
    select: { id: true, coverPath: true, coverColors: true },
  });

  // Filter client-side to only process works without colors
  const worksToProcess = works.filter(w => w.coverColors === null);

  console.log(`Found ${worksToProcess.length} works with covers but no colors (${works.length} total with covers)`);

  let processed = 0, failed = 0;

  for (const work of worksToProcess) {
    try {
      const mediumPath = path.join(COVER_CACHE_DIR, work.coverPath, "medium.webp");
      const buf = await readFile(mediumPath);
      const colors = await extractColors(buf);
      await db.work.update({ where: { id: work.id }, data: { coverColors: colors } });
      processed++;
      if (processed % 500 === 0) console.log(`  ${processed}/${worksToProcess.length}...`);
    } catch {
      failed++;
    }
  }

  console.log(`Done. Processed: ${processed}, Failed: ${failed}`);
  await db.$disconnect();
}

main();
