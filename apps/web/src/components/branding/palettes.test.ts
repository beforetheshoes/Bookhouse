import { describe, it, expect } from "vitest";
import {
  PALETTES,
  PALETTE_KEYS,
  DEFAULT_PALETTE_KEY,
  isPaletteKey,
} from "./palettes";

describe("palettes", () => {
  it("ships exactly four palettes", () => {
    expect(PALETTE_KEYS).toHaveLength(4);
    expect(PALETTE_KEYS).toEqual(["shelf", "sunset", "forest", "vivid"]);
  });

  it("defaults to shelf", () => {
    expect(DEFAULT_PALETTE_KEY).toBe("shelf");
  });

  it("each palette has seven bar colors plus a spine and name", () => {
    for (const key of PALETTE_KEYS) {
      const p = PALETTES[key];
      expect(p.bars).toHaveLength(7);
      expect(p.spine).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(0);
      for (const bar of p.bars) {
        expect(bar).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("isPaletteKey narrows known keys and rejects unknowns", () => {
    expect(isPaletteKey("shelf")).toBe(true);
    expect(isPaletteKey("vivid")).toBe(true);
    expect(isPaletteKey("rainbow")).toBe(false);
    expect(isPaletteKey("")).toBe(false);
  });
});
