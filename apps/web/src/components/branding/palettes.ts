export interface BookhousePalette {
  name: string;
  note: string;
  spine: string;
  bars: readonly [string, string, string, string, string, string, string];
}

export const PALETTES = {
  shelf: {
    name: "Shelf",
    note: "Library of spines — broad, jewel-toned. Each bar a different book.",
    spine: "#1a1714",
    bars: [
      "#c4423a",
      "#d68a2c",
      "#e8c14a",
      "#5a8a4f",
      "#3b6f93",
      "#6b4a8a",
      "#b34d6e",
    ],
  },
  sunset: {
    name: "Sunset",
    note: "Warm narrative arc — golds into reds. Cozy/literary.",
    spine: "#2a1a14",
    bars: [
      "#f0b94a",
      "#e89344",
      "#d96c3d",
      "#c44a3f",
      "#a83552",
      "#7e2a55",
      "#4a1e44",
    ],
  },
  forest: {
    name: "Forest",
    note: "Cool, contemplative. Greens through teals and indigo.",
    spine: "#0f1a14",
    bars: [
      "#4f7a3b",
      "#3a7a5a",
      "#2f7575",
      "#2c6488",
      "#2f4d8a",
      "#3a3a78",
      "#523365",
    ],
  },
  vivid: {
    name: "Vivid",
    note: "Saturated, modern. Energetic — leans app-icon.",
    spine: "#16111d",
    bars: [
      "#ff4d6d",
      "#ff8a3d",
      "#ffc145",
      "#3cc16e",
      "#3fa8d8",
      "#5b6cf0",
      "#a865e0",
    ],
  },
} as const satisfies Record<string, BookhousePalette>;

export type PaletteKey = keyof typeof PALETTES;

export const DEFAULT_PALETTE_KEY: PaletteKey = "shelf";

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];

export function isPaletteKey(value: string): value is PaletteKey {
  return value in PALETTES;
}
