import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { defineEventHandler, readMultipartFormData, createError } from "h3";
import type { H3Event } from "h3";
import { VALID_WORK_ID, MAX_FILE_SIZE, isValidImageData, isAllowedMimeType } from "@bookhouse/ingest";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export interface UploadHandlerDeps {
  coverCacheDir: string;
  readFormData: (event: H3Event) => Promise<{ name?: string; data: Uint8Array; type?: string }[] | undefined>;
  resizeAndSave: (imageBuffer: Buffer, outputDir: string) => Promise<void>;
  extractColors: (imageBuffer: Buffer) => Promise<string[]>;
  db: {
    findWork: (id: string) => Promise<{ editedFields: string[] } | null>;
    updateWork: (id: string, data: { coverPath: string; editedFields: string[]; coverColors?: string[] }) => Promise<void>;
  };
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

    if (!isAllowedMimeType(fileField.type)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid image type" });
    }

    if (!isValidImageData(fileField.data)) {
      throw createError({ statusCode: 400, statusMessage: "File is not a valid image" });
    }

    const imageBuffer = Buffer.from(fileField.data);
    const outputDir = path.join(deps.coverCacheDir, workId);

    await deps.resizeAndSave(imageBuffer, outputDir);

    let coverColors: string[] | undefined;
    try {
      coverColors = await deps.extractColors(imageBuffer);
    } catch {
      // Color extraction is non-critical — proceed without
    }

    const work = await deps.db.findWork(workId);
    if (!work) {
      throw createError({ statusCode: 404, statusMessage: "Work not found" });
    }

    const mergedEdited = [...new Set([...work.editedFields, "coverPath"])];
    await deps.db.updateWork(workId, { coverPath: workId, editedFields: mergedEdited, coverColors });

    return { success: true };
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createUploadHandler */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { resizeCoverImage, extractDominantColors } = await import("@bookhouse/ingest");
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
    extractColors: (buf) => extractDominantColors(buf, sharpModule.default as never),
    db: {
      findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
      updateWork: (id, data) => db.work.update({ where: { id }, data }) as unknown as Promise<void>,
    },
  });
  return handler(event);
});
/* c8 ignore stop */
