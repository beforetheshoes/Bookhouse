import path from "node:path";
import { MediaKind } from "@bookhouse/domain";

const MAX_SEGMENT_LENGTH = 120;

// Characters that are unsafe in folder names on at least one of
// Linux / macOS HFS / Windows NTFS. Each is replaced with a single
// space so adjacent words don't get concatenated.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHAR_PATTERN = /[\x00-\x1f\x7f/\\:"<>|?*]/g;

export function sanitizeFolderSegment(input: string): string {
  if (input === "") return "";

  const replaced = input.replace(UNSAFE_CHAR_PATTERN, " ");

  // Split on whitespace, drop empty/./.. tokens, rejoin with single spaces.
  const tokens = replaced
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== "." && token !== "..");

  const collapsed = tokens.join(" ");
  const trimmed = collapsed.replace(/^[.\s]+|[.\s]+$/g, "");

  if (trimmed === "" || trimmed === "." || trimmed === "..") return "";

  if (trimmed.length > MAX_SEGMENT_LENGTH) {
    return trimmed.slice(0, MAX_SEGMENT_LENGTH);
  }

  return trimmed;
}

export interface BuildBookFolderPathInput {
  libraryRootPath: string;
  author: string;
  title: string;
}

export function buildBookFolderPath(input: BuildBookFolderPathInput): string {
  const safeAuthor = sanitizeFolderSegment(input.author);
  if (safeAuthor === "") {
    throw new Error("author resolves to an empty folder name after sanitisation");
  }

  const safeTitle = sanitizeFolderSegment(input.title);
  if (safeTitle === "") {
    throw new Error("title resolves to an empty folder name after sanitisation");
  }

  // sanitizeFolderSegment strips path separators, so path.join's result
  // is guaranteed to stay inside the resolved library root.
  return path.join(path.resolve(input.libraryRootPath), safeAuthor, safeTitle);
}

export type SidecarKind = "opf" | "json";

const EBOOK_MEDIA_KINDS = new Set<MediaKind>([
  MediaKind.EPUB,
  MediaKind.KEPUB,
  MediaKind.MOBI,
  MediaKind.AZW,
  MediaKind.AZW3,
  MediaKind.PDF,
  MediaKind.CBZ,
]);

export function chooseSidecarKind(mediaKind: MediaKind): SidecarKind {
  if (EBOOK_MEDIA_KINDS.has(mediaKind)) return "opf";
  if (mediaKind === MediaKind.AUDIO) return "json";
  throw new Error(`No sidecar kind for media kind "${mediaKind}"`);
}
