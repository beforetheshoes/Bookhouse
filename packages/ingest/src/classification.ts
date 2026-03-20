import path from "node:path";
import { FormatFamily, MediaKind } from "@bookhouse/domain";

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
const SIDECAR_EXTENSIONS = new Set(["cue", "json", "nfo", "opf", "txt", "xml"]);

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
  if (mediaKind === MediaKind.EPUB || mediaKind === MediaKind.PDF || mediaKind === MediaKind.CBZ) return FormatFamily.EBOOK;
  if (mediaKind === MediaKind.AUDIO) return FormatFamily.AUDIOBOOK;
  return null;
}

export function classifyMediaKind(filePath: string): MediaKind {
  const extension = getFileExtension(filePath);

  switch (extension) {
    case "epub":
      return MediaKind.EPUB;
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

  if (extension !== null && SIDECAR_EXTENSIONS.has(extension)) {
    return MediaKind.SIDECAR;
  }

  return MediaKind.OTHER;
}
