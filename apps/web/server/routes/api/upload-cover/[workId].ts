import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { defineEventHandler, readMultipartFormData, createError } from "h3";
import type { H3Event } from "h3";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export interface UploadHandlerDeps {
  coverCacheDir: string;
  readFormData: (event: H3Event) => Promise<{ name?: string; data: Uint8Array; type?: string }[] | undefined>;
  resizeAndSave: (imageBuffer: Buffer, outputDir: string) => Promise<void>;
  db: {
    findWork: (id: string) => Promise<{ editedFields: string[] } | null>;
    updateWork: (id: string, data: { coverPath: string; editedFields: string[] }) => Promise<void>;
  };
}

const VALID_WORK_ID = /^[a-zA-Z0-9_-]+$/;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Magic byte signatures for supported image formats
const IMAGE_SIGNATURES: [number[], string][] = [
  [[0xFF, 0xD8, 0xFF], "JPEG"],
  [[0x89, 0x50, 0x4E, 0x47], "PNG"],
  [[0x52, 0x49, 0x46, 0x46], "WebP"], // RIFF header (WebP starts with RIFF....WEBP)
  [[0x47, 0x49, 0x46, 0x38], "GIF"],
];

function isValidImageData(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  return IMAGE_SIGNATURES.some(([sig]) =>
    sig.every((byte, i) => data[i] === byte),
  );
}

export function createUploadHandler(deps: UploadHandlerDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as { workId: string };
    const { workId } = params;

    if (!VALID_WORK_ID.test(workId)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid workId" });
    }

    const formData = await deps.readFormData(event);
    const fileField = formData?.find((f) => f.name === "file");

    if (!fileField?.data || fileField.data.length === 0) {
      throw createError({ statusCode: 400, statusMessage: "No file uploaded" });
    }

    if (fileField.data.length > MAX_FILE_SIZE) {
      throw createError({ statusCode: 400, statusMessage: "File too large (max 10 MB)" });
    }

    if (fileField.type && !ALLOWED_MIME_TYPES.has(fileField.type)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid image type" });
    }

    if (!isValidImageData(fileField.data)) {
      throw createError({ statusCode: 400, statusMessage: "File is not a valid image" });
    }

    const imageBuffer = Buffer.from(fileField.data);
    const outputDir = path.join(deps.coverCacheDir, workId);

    await deps.resizeAndSave(imageBuffer, outputDir);

    const work = await deps.db.findWork(workId);
    if (!work) {
      throw createError({ statusCode: 404, statusMessage: "Work not found" });
    }

    const mergedEdited = [...new Set([...work.editedFields, "coverPath"])];
    await deps.db.updateWork(workId, { coverPath: workId, editedFields: mergedEdited });

    return { success: true };
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createUploadHandler */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { resizeCoverImage } = await import("@bookhouse/ingest");
  const sharpModule = await import("sharp");

  const handler = createUploadHandler({
    coverCacheDir: COVER_CACHE_DIR,
    readFormData: readMultipartFormData,
    resizeAndSave: async (imageBuffer, outputDir) => {
      await resizeCoverImage(
        { imageBuffer, outputDir },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { sharp: sharpModule.default as never, mkdir, writeFile },
      );
    },
    db: {
      findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
      updateWork: (id, data) => db.work.update({ where: { id }, data }) as unknown as Promise<void>,
    },
  });
  return handler(event);
});
/* c8 ignore stop */
