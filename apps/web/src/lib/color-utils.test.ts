import { describe, it, expect } from "vitest";
import { hexToOklch, generateCoverTheme, generateAccentTheme } from "./color-utils";

describe("hexToOklch", () => {
  it("converts pure black", () => {
    const result = hexToOklch("#000000");
    expect(result.l).toBeCloseTo(0, 1);
    expect(result.c).toBeCloseTo(0, 1);
  });

  it("converts pure white", () => {
    const result = hexToOklch("#ffffff");
    expect(result.l).toBeCloseTo(1, 1);
    expect(result.c).toBeCloseTo(0, 1);
  });

  it("converts a mid-range color", () => {
    const result = hexToOklch("#3366cc");
    expect(result.l).toBeGreaterThan(0.3);
    expect(result.l).toBeLessThan(0.7);
    expect(result.c).toBeGreaterThan(0);
    expect(result.h).toBeGreaterThan(0);
  });

  it("converts pure red", () => {
    const result = hexToOklch("#ff0000");
    expect(result.l).toBeGreaterThan(0.5);
    expect(result.c).toBeGreaterThan(0.2);
  });

  it("handles 3-char hex shorthand", () => {
    const short = hexToOklch("#f00");
    const full = hexToOklch("#ff0000");
    expect(short.l).toBeCloseTo(full.l, 2);
    expect(short.c).toBeCloseTo(full.c, 2);
    expect(short.h).toBeCloseTo(full.h, 2);
  });

  it("returns NaN values for invalid hex string '#XYZ'", () => {
    const result = hexToOklch("#XYZ");
    expect(Number.isNaN(result.l)).toBe(true);
  });

  it("returns NaN values for non-hex string 'hello'", () => {
    const result = hexToOklch("hello");
    expect(Number.isNaN(result.l)).toBe(true);
  });

  it("returns NaN values for empty string", () => {
    const result = hexToOklch("");
    expect(Number.isNaN(result.l)).toBe(true);
  });

  it("is case insensitive — uppercase and lowercase produce same result", () => {
    const upper = hexToOklch("#FF00FF");
    const lower = hexToOklch("#ff00ff");
    expect(upper.l).toBeCloseTo(lower.l, 6);
    expect(upper.c).toBeCloseTo(lower.c, 6);
    expect(upper.h).toBeCloseTo(lower.h, 6);
  });
});

describe("generateCoverTheme", () => {
  it("returns null for null colors", () => {
    expect(generateCoverTheme(null, "light")).toBeNull();
  });

  it("returns null for empty colors array", () => {
    expect(generateCoverTheme([], "light")).toBeNull();
  });

  it("returns all CSS vars for valid colors in light mode", () => {
    const result = generateCoverTheme(["#1a2b3c", "#4d5e6f", "#a0b1c2"], "light");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("--cover-primary");
    expect(result).toHaveProperty("--cover-secondary");
    expect(result).toHaveProperty("--cover-accent");
    expect(result).toHaveProperty("--cover-text");
    expect(result?.["--cover-primary"]).toContain("oklch(0.88");
  });

  it("returns all CSS vars for valid colors in dark mode", () => {
    const result = generateCoverTheme(["#1a2b3c", "#4d5e6f", "#a0b1c2"], "dark");
    expect(result).not.toBeNull();
    expect(result?.["--cover-primary"]).toContain("oklch(0.22");
    expect(result?.["--cover-secondary"]).toContain("oklch(0.18");
    expect(result?.["--cover-text"]).toContain("oklch(0.90");
  });

  it("uses first color (darkest) for primary", () => {
    const lightResult = generateCoverTheme(["#102030", "#506070", "#a0b0c0"], "light");
    const darkResult = generateCoverTheme(["#102030", "#506070", "#a0b0c0"], "dark");
    // Both should produce values but with different lightness
    expect(lightResult?.["--cover-primary"]).not.toBe(darkResult?.["--cover-primary"]);
  });

  it("handles single color array", () => {
    const result = generateCoverTheme(["#3366cc"], "light");
    expect(result).not.toBeNull();
    expect(result?.["--cover-primary"]).toContain("oklch(");
  });
});

describe("generateAccentTheme", () => {
  it("returns all CSS vars for a hex color in light mode", () => {
    const result = generateAccentTheme("#3366cc", "light");
    expect(result).toHaveProperty("--cover-primary");
    expect(result).toHaveProperty("--cover-secondary");
    expect(result).toHaveProperty("--cover-accent");
    expect(result).toHaveProperty("--cover-text");
    expect(result["--cover-primary"]).toContain("oklch(0.88");
  });

  it("returns all CSS vars for a hex color in dark mode", () => {
    const result = generateAccentTheme("#3366cc", "dark");
    expect(result["--cover-primary"]).toContain("oklch(0.22");
    expect(result["--cover-secondary"]).toContain("oklch(0.18");
    expect(result["--cover-text"]).toContain("oklch(0.90");
  });

  it("uses the same hue for all vars since only one color is provided", () => {
    const result = generateAccentTheme("#ff0000", "light");
    // Extract hue from primary and accent — they should use the same hue angle
    const primaryHue = result["--cover-primary"]?.match(/oklch\([^ ]+ [^ ]+ ([^)]+)\)/)?.[1];
    const accentHue = result["--cover-accent"]?.match(/oklch\([^ ]+ [^ ]+ ([^)]+)\)/)?.[1];
    expect(primaryHue).toBeDefined();
    expect(primaryHue).toBe(accentHue);
  });

  it("enforces minimum chroma for low-chroma inputs", () => {
    // Pure gray has zero chroma — should be boosted to minC (0.04)
    const result = generateAccentTheme("#808080", "light");
    expect(result["--cover-primary"]).toContain("0.04");
  });

  it("produces different lightness values for light vs dark mode", () => {
    const lightResult = generateAccentTheme("#3366cc", "light");
    const darkResult = generateAccentTheme("#3366cc", "dark");
    expect(lightResult["--cover-primary"]).not.toBe(darkResult["--cover-primary"]);
  });
});
