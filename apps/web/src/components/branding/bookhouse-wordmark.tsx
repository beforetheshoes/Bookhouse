import { BookhouseMark } from "./bookhouse-mark";
import type { PaletteKey } from "./palettes";

export interface BookhouseWordmarkProps {
  size?: number;
  paletteKey?: PaletteKey;
  dark?: boolean;
}

export function BookhouseWordmark({
  size = 64,
  paletteKey,
  dark = false,
}: BookhouseWordmarkProps) {
  const gap = size * 0.35;
  const fontSize = size * 0.68;
  const letterSpacing = -size * 0.013;

  return (
    <div
      data-testid="bookhouse-wordmark"
      style={{
        display: "flex",
        alignItems: "center",
        gap,
        color: dark ? "#f3ede0" : "#15140f",
      }}
    >
      <BookhouseMark size={size} paletteKey={paletteKey} dark={dark} />
      <span
        style={{
          fontFamily: "var(--font-display, 'Fraunces'), Georgia, serif",
          fontWeight: 500,
          fontSize,
          letterSpacing,
          lineHeight: 1,
        }}
      >
        Bookhouse
      </span>
    </div>
  );
}
