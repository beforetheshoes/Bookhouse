import { canonicalizeBookTitle } from "./metadata";

export function normalizeForTitleMatching(displayTitle: string): string | undefined {
  let title = displayTitle;

  // Strip dash-separated trailing noise first (before paren stripping, since parens may precede dash suffixes)
  // e.g., "Fourth Wing (Part 1 of 2) - The Empyrean, Book 1" → "Fourth Wing (Part 1 of 2)"
  // e.g., "A Court of Wings and Ruin (1 of 3) - GraphicAudio" → "A Court of Wings and Ruin (1 of 3)"
  title = title.replace(/\s+-\s+GraphicAudio\s*$/i, "");
  title = title.replace(/\s+-\s+The\s+.+,\s*Book\s+\d+\s*$/i, "");
  title = title.replace(/\s+-\s+Part\s+\d+\s*$/i, "");

  // Strip trailing parentheticals repeatedly (catches narrator names, Unabridged, GraphicAudio, Part X of Y, series info)
  let prev = "";
  while (prev !== title) {
    prev = title;
    title = title.replace(/\s*\([^)]*\)\s*$/, "");
  }

  // Strip "A Novel" / "A Memoir" / "A Novella" / "A Novel in ..." suffixes after colon, dash, or standalone trailing
  title = title.replace(/\s*[:-]\s*A\s+Novel(?:\s+in\s+\w+(?:\s+\w+)*)?\s*$/i, "");
  title = title.replace(/\s+A\s+Novel(?:\s+in\s+\w+(?:\s+\w+)*)?\s*$/i, "");
  title = title.replace(/\s*[:-]\s*A\s+Memoir\s*$/i, "");
  title = title.replace(/\s+A\s+Memoir\s*$/i, "");
  title = title.replace(/\s*[:-]\s*A\s+Novella\s*$/i, "");
  title = title.replace(/\s+A\s+Novella\s*$/i, "");

  // Strip file format suffixes (standalone trailing words)
  title = title.replace(/\s+(?:M4B|m4b|M4A|m4a|MP3|mp3|EPUB|epub|MOBI|mobi|PDF|pdf)\s*$/i, "");

  // Strip edition markers: "Nth Anniversary [Edition]", "Edition", standalone
  title = title.replace(/\s+\d+(?:st|nd|rd|th)\s+Anniversary(?:\s+Edition)?\s*$/i, "");
  title = title.replace(/\s+Edition\s*$/i, "");

  return canonicalizeBookTitle(title);
}

export function stripSubtitleForMatching(displayTitle: string): string | undefined {
  const colonIdx = displayTitle.indexOf(":");
  const dashIdx = displayTitle.indexOf(" - ");

  let delimIdx = -1;
  if (colonIdx >= 0 && dashIdx >= 0) {
    delimIdx = Math.min(colonIdx, dashIdx);
  } else if (colonIdx >= 0) {
    delimIdx = colonIdx;
  } else if (dashIdx >= 0) {
    delimIdx = dashIdx;
  }

  if (delimIdx < 0) return undefined;

  const prefix = displayTitle.slice(0, delimIdx);
  return canonicalizeBookTitle(prefix) ?? undefined;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] as number) + 1,
        (curr[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j] as number;
    }
  }

  return prev[n] as number;
}

export function normalizedSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}
