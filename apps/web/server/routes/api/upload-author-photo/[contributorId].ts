import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { defineEventHandler, readMultipartFormData, createError } from "h3";
import type { H3Event } from "h3";
import { VALID_WORK_ID, MAX_FILE_SIZE, isValidImageData, isAllowedMimeType } from "@bookhouse/ingest";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export interface AuthorPhotoUploadDeps {
  coverCacheDir: string;
  readFormData: (event: H3Event) => Promise<{ name?: string; data: Uint8Array; type?: string }[] | undefined>;
  resizeAndSave: (imageBuffer: Buffer, outputDir: string) => Promise<void>;
  db: {
    findContributor: (id: string) => Promise<{ id: string } | null>;
    updateContributor: (id: string, data: { imagePath: string }) => Promise<void>;
  };
}

export function createAuthorPhotoUploadHandler(deps: AuthorPhotoUploadDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as { contributorId: string };
    const { contributorId } = params;

    if (!VALID_WORK_ID.test(contributorId)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid contributorId" });
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
    const outputDir = path.join(deps.coverCacheDir, "authors", contributorId);
    await deps.resizeAndSave(imageBuffer, outputDir);

    const contributor = await deps.db.findContributor(contributorId);
    if (!contributor) {
      throw createError({ statusCode: 404, statusMessage: "Contributor not found" });
    }

    await deps.db.updateContributor(contributorId, { imagePath: contributorId });

    return { success: true };
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createAuthorPhotoUploadHandler */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { resizeCoverImage } = await import("@bookhouse/ingest");
  const sharpModule = await import("sharp");

  const handler = createAuthorPhotoUploadHandler({
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
      findContributor: (id) => db.contributor.findUnique({ where: { id }, select: { id: true } }),
      updateContributor: async (id, data) => { await db.contributor.update({ where: { id }, data }); },
    },
  });
  return handler(event);
});
/* c8 ignore stop */
