import path from "node:path";
import { MediaKind } from "@bookhouse/domain";
import { canonicalizeBookTitle } from "./metadata";

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
