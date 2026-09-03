import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../../auth-helper";
import { loadKoboCoverJpeg, type KoboCoverImageDeps } from "../../../../cover-image";
import { httpError } from "../../../../../../utils/http-error";

export interface CoverHandlerDeps extends KoboCoverImageDeps {
  auth: KoboAuthDeps;
  findCoverRef: (editionId: string) => Promise<string | null>;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

// Per-book cover URL advertised as BookCover / BookCoverThumbnail in the
// book's metadata. The cache only holds WebP, which Kobo e-readers can't
// decode, so the bytes are transcoded to JPEG on the way out.
export function createCoverHandler(deps: CoverHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    await auth(event);

    const params = event.context.params as Record<string, string>;
    const bookId = params.bookId as string;

    if (!VALID_ID.test(bookId)) {
      throw httpError("Invalid bookId", 400);
    }

    const coverRef = await deps.findCoverRef(bookId);
    if (coverRef === null) {
      throw httpError("Cover not found", 404, "Not found");
    }

    const cover = await loadKoboCoverJpeg(deps, coverRef);
    if (cover === null) {
      throw httpError("Cover not found", 404, "Not found");
    }

    deps.setResponseHeader(event, "Content-Type", "image/jpeg");
    deps.setResponseHeader(event, "Content-Length", String(cover.jpeg.length));
    deps.setResponseHeader(event, "Cache-Control", "public, max-age=86400");

    return cover.jpeg;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { existsSync } = await import("node:fs");
  const { readFile } = await import("node:fs/promises");
  const { db } = await import("@bookhouse/db");

  const handler = createCoverHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    coverCacheDir: process.env.COVER_CACHE_DIR ?? "/data/covers",
    findCoverRef: async (editionId) => {
      const edition = await db.edition.findUnique({
        where: { id: editionId },
        select: { work: { select: { coverPath: true } } },
      });
      return edition?.work.coverPath ?? null;
    },
    existsSync,
    readFile,
    convertToJpeg: async (webp) => {
      const sharp = (await import("sharp")).default;
      return sharp(webp).jpeg({ quality: 80 }).toBuffer();
    },
    setResponseHeader: (evt, name, value) => {
      evt.res.headers.set(name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
