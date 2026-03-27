import { describe, it, expect, vi } from "vitest";
import { extractDominantColors } from "./cover-colors";

// Create a tiny 1x1 red PNG for testing
function makeRgbBuffer(r: number, g: number, b: number): Buffer {
  return Buffer.from([r, g, b]);
}

// Create a 4x4 raw RGB buffer with specific colors
function make4x4Buffer(colors: Array<[number, number, number]>): Buffer {
  const buf = Buffer.alloc(colors.length * 3);
  for (let i = 0; i < colors.length; i++) {
    const [r, g, b] = colors[i] as [number, number, number];
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  return buf;
}

interface SharpInstance {
  resize: (w: number, h: number) => SharpInstance;
  raw: () => SharpInstance;
  toBuffer: () => Promise<Buffer>;
  toColorspace: (cs: string) => SharpInstance;
}

function makeSharpMock(dominantPixel: Buffer, palettePixels: Buffer): (buf: Buffer) => SharpInstance {
  return vi.fn(() => {
    let resizeW = 0;
    const inst: SharpInstance = {
      resize: (w: number, _h: number) => { resizeW = w; return inst; },
      raw: () => inst,
      toColorspace: () => inst,
      toBuffer: () => Promise.resolve(resizeW === 1 ? dominantPixel : palettePixels),
    };
    return inst;
  });
}

describe("extractDominantColors", () => {
  it("returns 3 hex color strings", async () => {
    const dominant = makeRgbBuffer(200, 50, 50); // dark red
    // 8x8 = 64 pixels, mix of colors
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 32; i++) pixels.push([200, 50, 50]); // red (dominant)
    for (let i = 0; i < 16; i++) pixels.push([50, 100, 200]); // blue
    for (let i = 0; i < 16; i++) pixels.push([200, 200, 100]); // yellow
    const palette = make4x4Buffer(pixels);

    const sharpFn = makeSharpMock(dominant, palette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    for (const color of result) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("returns darkest color first", async () => {
    const dominant = makeRgbBuffer(10, 10, 10); // very dark
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 32; i++) pixels.push([10, 10, 10]); // dark
    for (let i = 0; i < 16; i++) pixels.push([128, 128, 128]); // mid
    for (let i = 0; i < 16; i++) pixels.push([240, 240, 240]); // light
    const palette = make4x4Buffer(pixels);

    const sharpFn = makeSharpMock(dominant, palette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    // First color should be darkest
    const firstR = parseInt(result[0]?.slice(1, 3) ?? "ff", 16);
    const lastR = parseInt(result[2]?.slice(1, 3) ?? "00", 16);
    expect(firstR).toBeLessThanOrEqual(lastR);
  });

  it("handles uniform color (all pixels the same)", async () => {
    const dominant = makeRgbBuffer(100, 150, 200);
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 64; i++) pixels.push([100, 150, 200]);
    const palette = make4x4Buffer(pixels);

    const sharpFn = makeSharpMock(dominant, palette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    // All should be the same color when uniform
    expect(result[0]).toBe(result[1]);
    expect(result[1]).toBe(result[2]);
  });

  it("handles grayscale images", async () => {
    const dominant = makeRgbBuffer(128, 128, 128);
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 64; i++) pixels.push([128, 128, 128]);
    const palette = make4x4Buffer(pixels);

    const sharpFn = makeSharpMock(dominant, palette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe("#808080");
  });

  it("falls back to dominant color when palette buffer is empty", async () => {
    const dominant = makeRgbBuffer(50, 100, 200);
    const emptyPalette = Buffer.alloc(0);

    const sharpFn = makeSharpMock(dominant, emptyPalette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    // All three colors should be the dominant color since clusters is empty
    const hex = "#3264c8";
    expect(result[0]).toBe(hex);
    expect(result[1]).toBe(hex);
    expect(result[2]).toBe(hex);
  });

  it("falls back to 128 when dominant buffer has insufficient bytes", async () => {
    // Dominant buffer with only 1 byte — g and b default to 128
    const shortDominant = Buffer.from([200]);
    const emptyPalette = Buffer.alloc(0);

    const sharpFn = makeSharpMock(shortDominant, emptyPalette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    // r=200 (0xc8), g=128 (0x80), b=128 (0x80)
    expect(result[0]).toBe("#c88080");
  });

  it("falls back to 128 when dominant buffer is completely empty", async () => {
    const emptyDominant = Buffer.alloc(0);
    const emptyPalette = Buffer.alloc(0);

    const sharpFn = makeSharpMock(emptyDominant, emptyPalette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    // All defaults: r=128, g=128, b=128
    expect(result[0]).toBe("#808080");
  });

  it("handles two-color image with cluster that has zero-length centroid distance", async () => {
    // All pixels are identical — maxDist will be 0 in centroid selection
    const dominant = makeRgbBuffer(42, 42, 42);
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 64; i++) pixels.push([42, 42, 42]);
    const palette = make4x4Buffer(pixels);

    const sharpFn = makeSharpMock(dominant, palette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe("#2a2a2a");
  });

  it("handles palette with only two distinct colors", async () => {
    const dominant = makeRgbBuffer(255, 0, 0);
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 32; i++) pixels.push([255, 0, 0]);
    for (let i = 0; i < 32; i++) pixels.push([0, 0, 255]);
    const palette = make4x4Buffer(pixels);

    const sharpFn = makeSharpMock(dominant, palette);
    const result = await extractDominantColors(Buffer.from([]), sharpFn);

    expect(result).toHaveLength(3);
    for (const color of result) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
