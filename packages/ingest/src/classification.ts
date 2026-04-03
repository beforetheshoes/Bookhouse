import path from "node:path";
import { FormatFamily, MediaKind } from "@bookhouse/domain";

export const IGNORED_BASENAMES = [".DS_Store", "Thumbs.db", "desktop.ini"] as const;
const IGNORED_BASENAMES_SET = new Set<string>(IGNORED_BASENAMES);

export function isIgnoredBasename(filePath: string): boolean {
  return IGNORED_BASENAMES_SET.has(path.basename(filePath));
}

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "m4b",
  "mp3",
  "ogg",
  "opus",
  "wav",
]);

const COVER_EXTENSIONS = new Set(["jpeg", "jpg", "png", "webp"]);
const SIDECAR_EXTENSIONS = new Set(["cue", "db", "json", "key", "mbp", "nfo", "opf", "pem", "sfv", "txt", "xml"]);
const SIDECAR_BASENAME_SUFFIXES = [".db-shm", ".db-wal"] as const;

export function normalizeRootPath(rootPath: string): string {
  return path.resolve(rootPath);
}

export function normalizeRelativePath(rootPath: string, absolutePath: string): string {
  const normalizedRootPath = normalizeRootPath(rootPath);
  const normalizedAbsolutePath = path.resolve(absolutePath);
  const relativePath = path.relative(normalizedRootPath, normalizedAbsolutePath);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `File path "${normalizedAbsolutePath}" is outside library root "${normalizedRootPath}"`,
    );
  }

  return relativePath;
}

export function getFileExtension(filePath: string): string | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension === "" ? null : extension;
}

export function deriveFormatFamily(mediaKind: MediaKind): FormatFamily | null {
  if (
    mediaKind === MediaKind.EPUB ||
    mediaKind === MediaKind.KEPUB ||
    mediaKind === MediaKind.MOBI ||
    mediaKind === MediaKind.AZW ||
    mediaKind === MediaKind.AZW3 ||
    mediaKind === MediaKind.PDF ||
    mediaKind === MediaKind.CBZ
  ) return FormatFamily.EBOOK;
  if (mediaKind === MediaKind.AUDIO) return FormatFamily.AUDIOBOOK;
  return null;
}

export function classifyMediaKind(filePath: string): MediaKind {
  const extension = getFileExtension(filePath);
  const basename = path.basename(filePath).toLowerCase();

  switch (extension) {
    case "epub":
      return MediaKind.EPUB;
    case "kepub":
      return MediaKind.KEPUB;
    case "mobi":
      return MediaKind.MOBI;
    case "azw":
      return MediaKind.AZW;
    case "azw3":
      return MediaKind.AZW3;
    case "pdf":
      return MediaKind.PDF;
    case "cbz":
      return MediaKind.CBZ;
    default:
      break;
  }

  if (extension !== null && AUDIO_EXTENSIONS.has(extension)) {
    return MediaKind.AUDIO;
  }

  if (extension !== null && COVER_EXTENSIONS.has(extension)) {
    return MediaKind.COVER;
  }

  if (
    (extension !== null && SIDECAR_EXTENSIONS.has(extension)) ||
    SIDECAR_BASENAME_SUFFIXES.some((suffix) => basename.endsWith(suffix))
  ) {
    return MediaKind.SIDECAR;
  }

  return MediaKind.OTHER;
}
