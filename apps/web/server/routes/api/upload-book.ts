import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import busboyFactory from "busboy";
import { defineEventHandler, createError } from "h3";
import type { H3Event } from "h3";
import {
  buildBookFolderPath,
  classifyMediaKind,
  buildOpfXml,
  buildAudiobookMetadataJson,
} from "@bookhouse/ingest";
import { MediaKind } from "@bookhouse/domain";

const SUPPORTED_EBOOK_KINDS = new Set<MediaKind>([
  MediaKind.EPUB,
  MediaKind.KEPUB,
  MediaKind.MOBI,
  MediaKind.AZW,
  MediaKind.AZW3,
  MediaKind.PDF,
  MediaKind.CBZ,
]);

export interface UploadBookFields {
  libraryRootId?: string;
  title?: string;
  author?: string;
  series?: string;
  seriesIndex?: string;
  description?: string;
}

export interface UploadedFilePart {
  basename: string;
  mediaKind: MediaKind;
  stagingPath: string;
  sizeBytes: number;
}

export interface FinalizeUploadFields {
  title: string;
  author: string;
  series?: string;
  seriesIndex?: string;
  description?: string;
}

export interface UploadBookHandlerDeps {
  requireOwner: (event: H3Event) => void;
  db: {
    findLibraryRoot: (id: string) => Promise<{ id: string; path: string } | null>;
    createImportJob: (data: {
      libraryRootId: string;
      kind: "UPLOAD_INGEST";
      status: "QUEUED";
    }) => Promise<{ id: string }>;
    setImportJobBullmqId: (id: string, bullmqJobId: string) => Promise<void>;
  };
  enqueueIngestJob: (payload: {
    libraryRootId: string;
    absolutePaths: string[];
    importJobId: string;
  }) => Promise<string | undefined>;
  parseMultipart: (event: H3Event, stagingDir: string) => Promise<{
    fields: UploadBookFields;
    files: UploadedFilePart[];
  }>;
  cleanup: (stagingDir: string) => Promise<void>;
  finalize: (input: {
    targetDir: string;
    files: UploadedFilePart[];
    fields: FinalizeUploadFields;
    mediaKind: "EBOOK" | "AUDIOBOOK";
  }) => Promise<{ absolutePaths: string[] }>;
  targetDirExists: (targetDir: string) => Promise<boolean>;
  ensureStagingDir: (stagingDir: string) => Promise<void>;
}

function classifyContentKind(mediaKind: MediaKind): "EBOOK" | "AUDIOBOOK" | null {
  if (SUPPORTED_EBOOK_KINDS.has(mediaKind)) return "EBOOK";
  if (mediaKind === MediaKind.AUDIO) return "AUDIOBOOK";
  return null;
}

export function isAllowedUploadFilename(basename: string): boolean {
  const mediaKind = classifyMediaKind(basename);
  if (classifyContentKind(mediaKind) !== null) return true;
  if (mediaKind === MediaKind.COVER) return true;
  if (mediaKind === MediaKind.SIDECAR) {
    const lower = basename.toLowerCase();
    return lower === "metadata.opf" || lower === "metadata.json";
  }
  return false;
}

export function sanitizeUploadFilename(basename: string): string {
  // Strip path components and unsafe chars; preserve extension. Disallow
  // dotfiles and path traversal segments.
  // eslint-disable-next-line no-control-regex -- intentionally strips control chars from filenames
  const stripped = path.basename(basename).replace(/[\x00-\x1f/\\:"<>|?*]/g, "_");
  if (stripped === "" || stripped === "." || stripped === "..") {
    return "";
  }
  if (stripped.startsWith(".")) {
    return "";
  }
  return stripped;
}

export function createUploadBookHandler(deps: UploadBookHandlerDeps) {
  return async (event: H3Event) => {
    deps.requireOwner(event);

    const uploadId = randomUUID();
    const tempParent = path.join(process.cwd(), ".tmp-uploads");
    const stagingDir = path.join(tempParent, uploadId);

    try {
      // Staging dir lives under cwd/.tmp-uploads; the rename to the final
      // location may cross volumes in dev but is atomic in prod because
      // /data/ebooks and the app's cwd are on the same volume.
      await deps.ensureStagingDir(stagingDir);

      const { fields, files } = await deps.parseMultipart(event, stagingDir);

      if (!fields.libraryRootId) {
        throw createError({ statusCode: 400, statusMessage: "libraryRootId is required" });
      }
      if (!fields.title) {
        throw createError({ statusCode: 400, statusMessage: "title is required" });
      }
      if (!fields.author) {
        throw createError({ statusCode: 400, statusMessage: "author is required" });
      }
      if (files.length === 0) {
        throw createError({ statusCode: 400, statusMessage: "at least one file is required" });
      }

      const contentFiles = files.filter((f) => classifyContentKind(f.mediaKind) !== null);
      if (contentFiles.length === 0) {
        throw createError({ statusCode: 400, statusMessage: "no book content files (epub/pdf/m4b/mp3) found" });
      }
      const contentKinds = new Set(
        contentFiles.map((f) => classifyContentKind(f.mediaKind)),
      );
      if (contentKinds.size > 1) {
        throw createError({ statusCode: 400, statusMessage: "cannot mix ebook and audiobook files in one upload" });
      }
      const mediaKind = [...contentKinds][0] as "EBOOK" | "AUDIOBOOK";

      const libraryRoot = await deps.db.findLibraryRoot(fields.libraryRootId);
      if (!libraryRoot) {
        throw createError({ statusCode: 404, statusMessage: "library root not found" });
      }

      const targetDir = buildBookFolderPath({
        libraryRootPath: libraryRoot.path,
        author: fields.author,
        title: fields.title,
      });

      // Conflict: refuse to overwrite an existing book folder.
      if (await deps.targetDirExists(targetDir)) {
        throw createError({ statusCode: 409, statusMessage: "a book folder already exists at the target path" });
      }

      const { absolutePaths } = await deps.finalize({
        targetDir,
        files,
        fields: {
          title: fields.title,
          author: fields.author,
          ...(fields.series !== undefined ? { series: fields.series } : {}),
          ...(fields.seriesIndex !== undefined ? { seriesIndex: fields.seriesIndex } : {}),
          ...(fields.description !== undefined ? { description: fields.description } : {}),
        },
        mediaKind,
      });

      const importJob = await deps.db.createImportJob({
        libraryRootId: libraryRoot.id,
        kind: "UPLOAD_INGEST",
        status: "QUEUED",
      });

      const bullmqJobId = await deps.enqueueIngestJob({
        libraryRootId: libraryRoot.id,
        absolutePaths,
        importJobId: importJob.id,
      });
      if (bullmqJobId !== undefined) {
        await deps.db.setImportJobBullmqId(importJob.id, bullmqJobId);
      }

      return {
        importJobId: importJob.id,
        libraryRootId: libraryRoot.id,
        folderRelativePath: path.relative(libraryRoot.path, targetDir),
        absolutePaths,
      };
    } finally {
      await deps.cleanup(stagingDir);
    }
  };
}

export interface ParseMultipartLimits {
  maxFileSizeBytes: number;
}

/* c8 ignore start — h3/busboy plumbing; pure validation extracted to
   sanitizeUploadFilename + isAllowedUploadFilename which are tested. */
export async function parseMultipartToStaging(
  event: H3Event,
  stagingDir: string,
  limits: ParseMultipartLimits = { maxFileSizeBytes: 4 * 1024 * 1024 * 1024 },
): Promise<{ fields: UploadBookFields; files: UploadedFilePart[] }> {
  const headers = Object.fromEntries(event.req.headers);
  const contentType = headers["content-type"] ?? headers["Content-Type"];
  if (typeof contentType !== "string" || !contentType.startsWith("multipart/form-data")) {
    throw createError({ statusCode: 415, statusMessage: "Content-Type must be multipart/form-data" });
  }
  const req = event.runtime?.node?.req;
  if (!req) {
    throw createError({ statusCode: 500, statusMessage: "request stream unavailable" });
  }

  return new Promise((resolve, reject) => {
    const fields: UploadBookFields = {};
    const files: UploadedFilePart[] = [];
    const pendingFileWrites: Promise<void>[] = [];
    let aborted = false;

    const bb = busboyFactory({
      headers: { "content-type": contentType },
      limits: { fileSize: limits.maxFileSizeBytes },
    });

    function abort(err: Error): void {
      if (aborted) return;
      aborted = true;
      bb.removeAllListeners();
      reject(err);
    }

    bb.on("field", (name, value) => {
      if (name === "libraryRootId") fields.libraryRootId = value;
      else if (name === "title") fields.title = value;
      else if (name === "author") fields.author = value;
      else if (name === "series") fields.series = value;
      else if (name === "seriesIndex") fields.seriesIndex = value;
      else if (name === "description") fields.description = value;
    });

    bb.on("file", (_name, fileStream, info) => {
      const sanitized = sanitizeUploadFilename(info.filename);
      if (sanitized === "" || !isAllowedUploadFilename(sanitized)) {
        fileStream.resume();
        abort(
          createError({
            statusCode: 400,
            statusMessage: `rejected file: ${info.filename}`,
          }),
        );
        return;
      }

      const stagingPath = path.join(stagingDir, sanitized);
      const writeStream = createWriteStream(stagingPath);
      const writePromise = pipeline(fileStream, writeStream).then(async () => {
        if ((fileStream as { truncated?: boolean }).truncated === true) {
          throw createError({
            statusCode: 413,
            statusMessage: `file too large: ${info.filename}`,
          });
        }
        const stats = await stat(stagingPath);
        files.push({
          basename: sanitized,
          mediaKind: classifyMediaKind(sanitized),
          stagingPath,
          sizeBytes: stats.size,
        });
      });
      pendingFileWrites.push(writePromise);
    });

    bb.on("error", (err) => { abort(err as Error); });
    bb.on("close", () => {
      if (aborted) return;
      Promise.all(pendingFileWrites)
        .then(() => { resolve({ fields, files }); })
        .catch((err: Error) => { abort(err); });
    });

    req.pipe(bb);
  });
}
/* c8 ignore stop */

export async function finalizeUpload(input: {
  targetDir: string;
  files: UploadedFilePart[];
  fields: FinalizeUploadFields;
  mediaKind: "EBOOK" | "AUDIOBOOK";
}): Promise<{ absolutePaths: string[] }> {
  await mkdir(input.targetDir, { recursive: true });
  const absolutePaths: string[] = [];
  for (const file of input.files) {
    const finalPath = path.join(input.targetDir, file.basename);
    await rename(file.stagingPath, finalPath);
    absolutePaths.push(finalPath);
  }

  // Write a sidecar with the user-supplied metadata, unless the user
  // already uploaded one (we don't overwrite their explicit choice).
  const hasOpfSidecar = input.files.some((f) => f.basename.toLowerCase() === "metadata.opf");
  const hasJsonSidecar = input.files.some((f) => f.basename.toLowerCase() === "metadata.json");

  if (input.mediaKind === "EBOOK" && !hasOpfSidecar) {
    const xml = buildOpfXml({
      title: input.fields.title,
      authors: [{ name: input.fields.author }],
      identifiers: [],
      description: input.fields.description,
      subjects: [],
      series: input.fields.series !== undefined
        ? {
            name: input.fields.series,
            ...(input.fields.seriesIndex !== undefined
              ? { index: Number(input.fields.seriesIndex) }
              : {}),
          }
        : undefined,
    });
    const opfPath = path.join(input.targetDir, "metadata.opf");
    await writeFile(opfPath, xml);
    absolutePaths.push(opfPath);
  } else if (input.mediaKind === "AUDIOBOOK" && !hasJsonSidecar) {
    const json = buildAudiobookMetadataJson({
      title: input.fields.title,
      authors: [input.fields.author],
      narrators: [],
      series: input.fields.series !== undefined
        ? [{ name: input.fields.series, sequence: input.fields.seriesIndex ?? "" }]
        : [],
      genres: [],
      ...(input.fields.description !== undefined ? { description: input.fields.description } : {}),
    });
    const jsonPath = path.join(input.targetDir, "metadata.json");
    await writeFile(jsonPath, json);
    absolutePaths.push(jsonPath);
  }

  return { absolutePaths };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createUploadBookHandler */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { enqueueLibraryJob, LIBRARY_JOB_NAMES } = await import("@bookhouse/shared");
  const { requireOwnerFromEvent } = await import("../../middleware/auth");

  const handler = createUploadBookHandler({
    requireOwner: (e) => { requireOwnerFromEvent(e); },
    db: {
      findLibraryRoot: (id) =>
        db.libraryRoot.findUnique({ where: { id }, select: { id: true, path: true } }),
      createImportJob: (data) =>
        db.importJob.create({ data, select: { id: true } }),
      setImportJobBullmqId: async (id, bullmqJobId) => {
        await db.importJob.update({ where: { id }, data: { bullmqJobId } });
      },
    },
    enqueueIngestJob: (payload) =>
      enqueueLibraryJob(LIBRARY_JOB_NAMES.INGEST_UPLOADED_BOOK, payload),
    parseMultipart: parseMultipartToStaging,
    finalize: finalizeUpload,
    cleanup: async (dir) => {
      await rm(dir, { recursive: true, force: true });
    },
    targetDirExists: async (dir) => {
      const result = await stat(dir).catch(() => null);
      return result !== null;
    },
    ensureStagingDir: async (dir) => {
      await mkdir(dir, { recursive: true });
    },
  });

  return handler(event);
});
/* c8 ignore stop */
