import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { defineEventHandler, HTTPError } from "h3";
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
  requireOwner: (event: H3Event) => void;
}

export function createUploadHandler(deps: UploadHandlerDeps) {
  return async (event: H3Event) => {
    deps.requireOwner(event);
    const params = event.context.params as { workId: string };
    const { workId } = params;

    if (!VALID_WORK_ID.test(workId)) {
      throw new HTTPError({ status: 400, statusText: "Invalid workId" });
    }

    const formData = await deps.readFormData(event);
    const fileField = formData?.find((f) => f.name === "file");

    if (!fileField?.data || fileField.data.length === 0) {
      throw new HTTPError({ status: 400, statusText: "No file uploaded" });
    }

    if (fileField.data.length > MAX_FILE_SIZE) {
      throw new HTTPError({ status: 400, statusText: "File too large (max 10 MB)" });
    }

    if (!isAllowedMimeType(fileField.type)) {
      throw new HTTPError({ status: 400, statusText: "Invalid image type" });
    }

    if (!isValidImageData(fileField.data)) {
      throw new HTTPError({ status: 400, statusText: "File is not a valid image" });
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
      throw new HTTPError({ status: 404, statusText: "Work not found" });
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

  const { requireOwnerFromEvent } = await import("../../../middleware/auth");

  const handler = createUploadHandler({
    coverCacheDir: COVER_CACHE_DIR,
    readFormData: async (event) => {
      const formData = await event.req.formData();
      return Promise.all(
        [...formData.entries()].map(async ([name, value]) =>
          value instanceof Blob
            ? { name, type: value.type, data: new Uint8Array(await value.arrayBuffer()) }
            : { name, data: new TextEncoder().encode(value) },
        ),
      );
    },
    resizeAndSave: async (imageBuffer, outputDir) => {
      await resizeCoverImage(
        { imageBuffer, outputDir },
         
        { sharp: sharpModule.default as never, mkdir, writeFile },
      );
    },
    extractColors: (buf) => extractDominantColors(buf, sharpModule.default),
    db: {
      findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
      updateWork: async (id, data) => { await db.work.update({ where: { id }, data }); },
    },
    requireOwner: (e) => { requireOwnerFromEvent(e); },
  });
  return handler(event);
});
/* c8 ignore stop */
