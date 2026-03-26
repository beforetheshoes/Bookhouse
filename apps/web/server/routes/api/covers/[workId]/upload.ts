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

/* c8 ignore start — runtime wiring uses native sharp module, tested via integration */
async function resizeAndSaveDefault(imageBuffer: Buffer, outputDir: string): Promise<void> {
  // @ts-expect-error — sharp is a native module resolved at runtime
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const sharp = (await import("sharp")).default;
  await mkdir(outputDir, { recursive: true });

  const thumbBuffer = await sharp(imageBuffer)
    .resize(200, undefined, { fit: "inside", withoutEnlargement: true })
    .webp()
    .toBuffer();

  const mediumBuffer = await sharp(imageBuffer)
    .resize(400, undefined, { fit: "inside", withoutEnlargement: true })
    .webp()
    .toBuffer();

  await writeFile(path.join(outputDir, "thumb.webp"), thumbBuffer);
  await writeFile(path.join(outputDir, "medium.webp"), mediumBuffer);
}

export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const handler = createUploadHandler({
    coverCacheDir: COVER_CACHE_DIR,
    readFormData: readMultipartFormData,
    resizeAndSave: resizeAndSaveDefault,
    db: {
      findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
      updateWork: (id, data) => db.work.update({ where: { id }, data }) as unknown as Promise<void>,
    },
  });
  return handler(event);
});
/* c8 ignore stop */
