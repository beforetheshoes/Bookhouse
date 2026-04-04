import path from "node:path";
import { MediaKind } from "@bookhouse/domain";
import { canonicalizeBookTitle } from "./metadata";

const SUBTITLE_STARTERS = /^(?:the|a|an|how|why|what|in|on|of|for)\s/i;

export function stripFilenameAuthorSuffix(title: string): string {
  // Always strip from the last en-dash (U+2013) — Calibre convention
  const enDashIdx = title.lastIndexOf(" \u2013 ");
  if (enDashIdx >= 0) {
    return title.slice(0, enDashIdx).trim();
  }

  // Always strip from the last em-dash (U+2014)
  const emDashIdx = title.lastIndexOf(" \u2014 ");
  if (emDashIdx >= 0) {
    return title.slice(0, emDashIdx).trim();
  }

  // Conditionally strip from the last regular hyphen — only when suffix doesn't look like a subtitle
  const hyphenIdx = title.lastIndexOf(" - ");
  if (hyphenIdx >= 0) {
    const suffix = title.slice(hyphenIdx + 3).trim();
    if (!SUBTITLE_STARTERS.test(suffix)) {
      return title.slice(0, hyphenIdx).trim();
    }
  }

  return title;
}

export function deriveTitleFromPath(
  relativePath: string,
  mediaKind: MediaKind,
): { title: string; titleCanonical: string } {
  let raw: string;

  if (mediaKind === MediaKind.AUDIO) {
    const dir = path.dirname(relativePath);
    raw = dir === "." ? path.basename(relativePath, path.extname(relativePath)) : path.basename(dir);
  } else {
    raw = path.basename(relativePath, path.extname(relativePath));
  }

  // Replace underscores with spaces
  raw = raw.replace(/_/g, " ");

  // Replace hyphens that are NOT surrounded by spaces (word separators, not "Title - Author")
  raw = raw.replace(/(?<!\s)-(?!\s)/g, " ");

  raw = raw.replace(/\s+/g, " ").trim();

  const titleCanonical = canonicalizeBookTitle(raw) ?? raw.toLowerCase();

  return { title: raw, titleCanonical };
}
