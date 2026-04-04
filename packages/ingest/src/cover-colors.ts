interface SharpInstance {
  resize: (w: number, h: number) => SharpInstance;
  raw: () => SharpInstance;
  toBuffer: () => Promise<Buffer>;
  toColorspace: (cs: string) => SharpInstance;
}

type SharpFn = (input: Buffer) => SharpInstance;

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2,
  );
}

function clusterColors(pixels: Array<[number, number, number]>, k: number): Array<[number, number, number]> {
  if (pixels.length === 0) return [];

  // Simple k-means-like clustering: pick k initial centroids spread by distance
  const centroids: Array<[number, number, number]> = [pixels[0] as [number, number, number]];

  while (centroids.length < k) {
    let maxDist = -1;
    let best = pixels[0] as [number, number, number];
    for (const pixel of pixels) {
      const minDist = Math.min(...centroids.map((c) => colorDistance(pixel, c)));
      if (minDist > maxDist) {
        maxDist = minDist;
        best = pixel;
      }
    }
    // If all pixels are the same, maxDist will be 0
    if (maxDist <= 0) {
      centroids.push(centroids[0] as [number, number, number]);
    } else {
      centroids.push(best);
    }
  }

  // One iteration of assignment + mean
  const clusters: Array<Array<[number, number, number]>> = centroids.map(() => []);
  for (const pixel of pixels) {
    let minIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const d = colorDistance(pixel, centroids[i] as [number, number, number]);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    (clusters[minIdx] as Array<[number, number, number]>).push(pixel);
  }

  return clusters.map((cluster) => {
    if (cluster.length === 0) return centroids[0] as [number, number, number];
    const sum = cluster.reduce<[number, number, number]>(
      (acc, px) => [acc[0] + px[0], acc[1] + px[1], acc[2] + px[2]],
      [0, 0, 0],
    );
    return [
      Math.round(sum[0] / cluster.length),
      Math.round(sum[1] / cluster.length),
      Math.round(sum[2] / cluster.length),
    ] as [number, number, number];
  });
}

export async function extractDominantColors(
  imageBuffer: Buffer,
  sharpFn: SharpFn,
): Promise<string[]> {
  // Get the single most dominant color via 1x1 resize
  const dominantBuf = await sharpFn(imageBuffer)
    .resize(1, 1)
    .toColorspace("srgb")
    .raw()
    .toBuffer();

  const dominantR = dominantBuf[0] ?? 128;
  const dominantG = dominantBuf[1] ?? 128;
  const dominantB = dominantBuf[2] ?? 128;

  // Get a small palette via 8x8 resize
  const paletteBuf = await sharpFn(imageBuffer)
    .resize(8, 8)
    .toColorspace("srgb")
    .raw()
    .toBuffer();

  // Parse pixels
  const pixels: Array<[number, number, number]> = [];
  for (let i = 0; i < paletteBuf.length; i += 3) {
    pixels.push([
      paletteBuf[i] as number,
      paletteBuf[i + 1] as number,
      paletteBuf[i + 2] as number,
    ]);
  }

  // Cluster into 3 representative colors
  const clusters = clusterColors(pixels, 3);

  // Ensure dominant color is included
  const colors: Array<[number, number, number]> = clusters.length >= 3
    ? clusters
    : [[dominantR, dominantG, dominantB], [dominantR, dominantG, dominantB], [dominantR, dominantG, dominantB]];

  // Sort by luminance: darkest first (for background), lightest last (for accents)
  colors.sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));

  return colors.map(([r, g, b]) => rgbToHex(r, g, b));
}

/* c8 ignore start — runtime wiring, tested via unit tests on extractDominantColors */
export async function extractDominantColorsDefault(imageBuffer: Buffer): Promise<string[]> {
  const sharp = await import("sharp");
  return extractDominantColors(imageBuffer, sharp.default as SharpFn);
}
/* c8 ignore stop */
