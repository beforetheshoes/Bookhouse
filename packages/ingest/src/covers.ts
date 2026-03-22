import path from "node:path";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import sharp from "sharp";
import { MediaKind } from "@bookhouse/domain";
import { createLogger } from "@bookhouse/shared";
import { classifyMediaKind } from "./classification";
import { extractEpubCover, type EpubCoverResult } from "./epub";

type ListDirectoryFn = (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
type ReadFileFn = (path: string) => Promise<Buffer>;
type MkdirFn = (path: string, options: { recursive: true }) => Promise<string | undefined>;
type WriteFileFn = (path: string, data: Buffer) => Promise<void>;

export interface ProcessCoverInput {
  workId: string;
  fileAssetId: string;
  coverCacheDir: string;
}

export interface ProcessCoverResult {
  source: "epub" | "adjacent" | "none";
  updated: boolean;
}

interface FileAssetRecord {
  id: string;
  absolutePath: string;
  mediaKind: MediaKind;
}

export interface CoverDb {
  fileAsset: {
    findUnique(args: { where: { id: string } }): Promise<FileAssetRecord | null>;
  };
  work: {
    update(args: { where: { id: string }; data: { coverPath: string } }): Promise<unknown>;
  };
}

export interface ResizeCoverDeps {
  sharp: (input: Buffer) => { resize: (width: number, height: undefined, options: { fit: string; withoutEnlargement: boolean }) => { webp: () => { toBuffer: () => Promise<Buffer> } } };
  mkdir: MkdirFn;
  writeFile: WriteFileFn;
}

export interface CoverLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface CoverDependencies {
  extractEpubCover: (absolutePath: string) => Promise<EpubCoverResult | null>;
  readFile: ReadFileFn;
  detectAdjacentCover: (directory: string, listDirectory?: ListDirectoryFn) => Promise<string | null>;
  resizeCoverImage: (input: { imageBuffer: Buffer; outputDir: string }, deps: ResizeCoverDeps) => Promise<{ thumbPath: string; mediumPath: string }>;
  db: CoverDb;
  logger?: CoverLogger;
}

export async function detectAdjacentCover(
  directory: string,
  listDirectory: ListDirectoryFn,
): Promise<string | null> {
  let entries: Dirent[];

  try {
    entries = await listDirectory(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  let coverFile: string | null = null;
  let fallbackFile: string | null = null;

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const mediaKind = classifyMediaKind(entry.name);
    if (mediaKind !== MediaKind.COVER) {
      continue;
    }

    const baseName = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
    if (baseName === "cover") {
      coverFile = path.join(directory, entry.name);
      break;
    }

    if (fallbackFile === null) {
      fallbackFile = path.join(directory, entry.name);
    }
  }

  return coverFile ?? fallbackFile;
}

export async function resizeCoverImage(
  input: { imageBuffer: Buffer; outputDir: string },
  deps: ResizeCoverDeps,
): Promise<{ thumbPath: string; mediumPath: string }> {
  await deps.mkdir(input.outputDir, { recursive: true });

  const thumbPath = path.join(input.outputDir, "thumb.webp");
  const mediumPath = path.join(input.outputDir, "medium.webp");

  const thumbBuffer = await deps.sharp(input.imageBuffer)
    .resize(200, undefined, { fit: "inside", withoutEnlargement: true })
    .webp()
    .toBuffer();

  const mediumBuffer = await deps.sharp(input.imageBuffer)
    .resize(400, undefined, { fit: "inside", withoutEnlargement: true })
    .webp()
    .toBuffer();

  await deps.writeFile(thumbPath, thumbBuffer);
  await deps.writeFile(mediumPath, mediumBuffer);

  return { thumbPath, mediumPath };
}

export async function processCoverForWork(
  input: ProcessCoverInput,
  deps: CoverDependencies,
): Promise<ProcessCoverResult> {
  const fileAsset = await deps.db.fileAsset.findUnique({
    where: { id: input.fileAssetId },
  });

  if (fileAsset === null) {
    throw new Error(`File asset "${input.fileAssetId}" was not found`);
  }

  let imageBuffer: Buffer | null = null;
  let source: "epub" | "adjacent" | "none" = "none";

  // Try EPUB embedded cover first
  if (fileAsset.mediaKind === MediaKind.EPUB) {
    try {
      const epubCover = await deps.extractEpubCover(fileAsset.absolutePath);
      if (epubCover !== null) {
        imageBuffer = epubCover.buffer;
        source = "epub";
      }
    } catch {
      // EPUB cover extraction failed (e.g., missing zip entry) — fall through to adjacent cover
      deps.logger?.info({ workId: input.workId, fileAssetId: input.fileAssetId }, "EPUB cover extraction failed, trying adjacent cover");
    }
  }

  // Fallback to adjacent cover file
  if (imageBuffer === null) {
    const directory = path.dirname(fileAsset.absolutePath);
    const adjacentPath = await deps.detectAdjacentCover(directory);
    if (adjacentPath !== null) {
      imageBuffer = await deps.readFile(adjacentPath);
      source = "adjacent";
    }
  }

  if (imageBuffer === null) {
    deps.logger?.info({ workId: input.workId, fileAssetId: input.fileAssetId, mediaKind: fileAsset.mediaKind, directory: path.dirname(fileAsset.absolutePath) }, "No cover found for work");
    return { source: "none", updated: false };
  }

  const work = await deps.db.work.findUnique({ where: { id: input.workId } });
  if (work === null) {
    deps.logger?.info({ workId: input.workId }, "Work no longer exists, skipping cover processing");
    return { source: "none", updated: false };
  }

  const outputDir = path.join(input.coverCacheDir, input.workId);
  await deps.resizeCoverImage({ imageBuffer, outputDir }, {} as ResizeCoverDeps);

  await deps.db.work.update({
    where: { id: input.workId },
    data: { coverPath: input.workId },
  });

  deps.logger?.info({ workId: input.workId, source }, "Cover processed successfully");
  return { source, updated: true };
}

export function processCoverForWorkDefault(db: CoverDb) {
  const logger = createLogger("process-cover");
  return (input: ProcessCoverInput) =>
    processCoverForWork(input, {
      db,
      extractEpubCover,
      logger,
      readFile,
      detectAdjacentCover: (directory) => detectAdjacentCover(directory, readdir),
      resizeCoverImage: (resizeInput) =>
        resizeCoverImage(resizeInput, { sharp: sharp as never, mkdir, writeFile }),
    });
}
