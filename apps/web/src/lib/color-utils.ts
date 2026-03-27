// Hex RGB → OKLCH color conversion
// Pipeline: hex → sRGB → linear sRGB → XYZ (D65) → Oklab → OKLCH

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  // sRGB to XYZ (D65) matrix
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  return [x, y, z];
}

function xyzToOklab(x: number, y: number, z: number): [number, number, number] {
  // XYZ to LMS (cone responses)
  const l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
  const m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
  const s_ = 0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z;

  // Cube root
  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  // LMS to Lab
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  return [L, a, bVal];
}

export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const [sr, sg, sb] = parseHex(hex);
  const [lr, lg, lb] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)];
  const [x, y, z] = linearRgbToXyz(lr, lg, lb);
  const [L, a, b] = xyzToOklab(x, y, z);

  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h };
}

export function generateCoverTheme(
  colors: string[] | null,
  mode: "light" | "dark",
): Record<string, string> | null {
  if (!colors || colors.length === 0) return null;

  const primary = hexToOklch(colors[0] as string);
  const secondary = colors.length > 1 ? hexToOklch(colors[1] as string) : primary;
  const accent = colors.length > 2 ? hexToOklch(colors[2] as string) : secondary;

  // Ensure minimum chroma so the color is actually visible
  const minC = 0.04;
  const pC = Math.max(primary.c, minC);
  const sC = Math.max(secondary.c, minC);
  const aC = Math.max(accent.c, minC);

  if (mode === "light") {
    // Light mode: high lightness but keep real chroma — visible, saturated tint
    return {
      "--cover-primary": `oklch(0.88 ${Math.min(pC, 0.12).toFixed(4)} ${primary.h.toFixed(1)})`,
      "--cover-secondary": `oklch(0.92 ${Math.min(sC, 0.08).toFixed(4)} ${secondary.h.toFixed(1)})`,
      "--cover-accent": `oklch(0.60 ${Math.min(aC, 0.18).toFixed(4)} ${accent.h.toFixed(1)})`,
      "--cover-text": `oklch(0.25 ${Math.min(pC, 0.05).toFixed(4)} ${primary.h.toFixed(1)})`,
    };
  }

  // Dark mode: low lightness but visible chroma — rich, moody, colorful darkness
  return {
    "--cover-primary": `oklch(0.22 ${Math.min(pC, 0.10).toFixed(4)} ${primary.h.toFixed(1)})`,
    "--cover-secondary": `oklch(0.18 ${Math.min(sC, 0.07).toFixed(4)} ${secondary.h.toFixed(1)})`,
    "--cover-accent": `oklch(0.55 ${Math.min(aC, 0.16).toFixed(4)} ${accent.h.toFixed(1)})`,
    "--cover-text": `oklch(0.90 ${Math.min(pC, 0.04).toFixed(4)} ${primary.h.toFixed(1)})`,
  };
}

export function generateAccentTheme(
  hex: string,
  mode: "light" | "dark",
): Record<string, string> {
  const color = hexToOklch(hex);
  const c = Math.max(color.c, 0.04);

  if (mode === "light") {
    return {
      "--cover-primary": `oklch(0.88 ${Math.min(c, 0.12).toFixed(4)} ${color.h.toFixed(1)})`,
      "--cover-secondary": `oklch(0.92 ${Math.min(c, 0.08).toFixed(4)} ${color.h.toFixed(1)})`,
      "--cover-accent": `oklch(0.60 ${Math.min(c, 0.18).toFixed(4)} ${color.h.toFixed(1)})`,
      "--cover-text": `oklch(0.25 ${Math.min(c, 0.05).toFixed(4)} ${color.h.toFixed(1)})`,
    };
  }

  return {
    "--cover-primary": `oklch(0.22 ${Math.min(c, 0.10).toFixed(4)} ${color.h.toFixed(1)})`,
    "--cover-secondary": `oklch(0.18 ${Math.min(c, 0.07).toFixed(4)} ${color.h.toFixed(1)})`,
    "--cover-accent": `oklch(0.55 ${Math.min(c, 0.16).toFixed(4)} ${color.h.toFixed(1)})`,
    "--cover-text": `oklch(0.90 ${Math.min(c, 0.04).toFixed(4)} ${color.h.toFixed(1)})`,
  };
}
