import path from "node:path";
import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";

const VALID_ID = /^[a-zA-Z0-9_-]+$/;
const VALID_SIZES: Record<string, string> = {
  thumb: "thumb",
  medium: "medium",
};

export interface OpdsCoverHandlerDeps {
  coverCacheDir: string;
  existsSync: (path: string) => boolean;
  readFile: (path: string) => Promise<Buffer>;
  convertToJpeg: (buffer: Buffer) => Promise<Buffer>;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createOpdsCoverHandler(deps: OpdsCoverHandlerDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const workId = params.workId as string;
    const size = params.size as string;

    if (!VALID_ID.test(workId)) {
      throw Object.assign(new Error("Invalid workId"), {
        statusCode: 400,
        statusMessage: "Invalid workId",
      });
    }

    const sizeKey = VALID_SIZES[size];
    if (!sizeKey) {
      throw Object.assign(new Error("Invalid size"), {
        statusCode: 400,
        statusMessage: "Invalid size",
      });
    }

    const filePath = path.join(deps.coverCacheDir, workId, `${sizeKey}.webp`);

    if (!deps.existsSync(filePath)) {
      throw Object.assign(new Error("Cover not found"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    const webpBuffer = await deps.readFile(filePath);
    const jpegBuffer = await deps.convertToJpeg(webpBuffer);

    deps.setResponseHeader(event, "Content-Type", "image/jpeg");
    deps.setResponseHeader(event, "Cache-Control", "public, max-age=86400");

    return jpegBuffer;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { existsSync } = await import("node:fs");
  const { readFile } = await import("node:fs/promises");

  const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

  const handler = createOpdsCoverHandler({
    coverCacheDir: COVER_CACHE_DIR,
    existsSync,
    readFile,
    convertToJpeg: async (buffer) => {
      const sharp = (await import("sharp")).default;
      return sharp(buffer).jpeg({ quality: 80 }).toBuffer();
    },
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
