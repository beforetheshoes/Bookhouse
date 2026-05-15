import { PALETTES, DEFAULT_PALETTE_KEY, type PaletteKey } from "./palettes";

const BAR_HEIGHTS = [28, 36, 42, 30, 44, 34, 24] as const;
const SHELF_Y = 55.6;

export interface BookhouseMarkProps {
  size?: number;
  paletteKey?: PaletteKey;
  dark?: boolean;
  shelf?: boolean;
  title?: string;
}

export function BookhouseMark({
  size = 64,
  paletteKey = DEFAULT_PALETTE_KEY,
  dark = false,
  shelf = true,
  title,
}: BookhouseMarkProps) {
  const palette = PALETTES[paletteKey];
  const ink = dark ? "#f3ede0" : "#15140f";
  const spineColor = dark ? "#f3ede0" : palette.spine;
  const titleBandColor = dark ? "#15140f" : "#f6f3ed";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-testid="bookhouse-mark"
    >
      <rect x="8" y="10" width="11" height="44" rx="1.4" fill={spineColor} />
      <rect
        x="10.5"
        y="16"
        width="6"
        height="1.2"
        fill={titleBandColor}
        opacity="0.55"
      />
      <rect
        x="10.5"
        y="46"
        width="6"
        height="1.2"
        fill={titleBandColor}
        opacity="0.55"
      />
      {BAR_HEIGHTS.map((h, i) => (
        <rect
          key={i}
          x={23 + i * 4.6}
          y={54 - h}
          width="3.2"
          height={h}
          rx="1.2"
          fill={palette.bars[i]}
        />
      ))}
      {shelf && (
        <line
          x1="6"
          y1={SHELF_Y}
          x2="58"
          y2={SHELF_Y}
          stroke={ink}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={dark ? 0.7 : 0.85}
        />
      )}
    </svg>
  );
}

export interface BookhouseMarkMonoProps {
  size?: number;
  color?: string;
  bg?: string | null;
  title?: string;
}

export function BookhouseMarkMono({
  size = 64,
  color = "#15140f",
  bg = null,
  title,
}: BookhouseMarkMonoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-testid="bookhouse-mark-mono"
    >
      {bg !== null && (
        <rect x="0" y="0" width="64" height="64" rx="14" fill={bg} />
      )}
      <rect x="8" y="10" width="11" height="44" rx="1.4" fill={color} />
      {BAR_HEIGHTS.map((h, i) => (
        <rect
          key={i}
          x={23 + i * 4.6}
          y={54 - h}
          width="3.2"
          height={h}
          rx="1.2"
          fill={color}
        />
      ))}
      <line
        x1="6"
        y1={SHELF_Y}
        x2="58"
        y2={SHELF_Y}
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
