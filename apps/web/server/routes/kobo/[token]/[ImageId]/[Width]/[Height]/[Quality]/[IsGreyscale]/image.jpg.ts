import { defineEventHandler, noContent } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../../../../auth-helper";
import {
  loadKoboCoverJpeg,
  resolveKoboCoverRef,
  type KoboCoverImageDeps,
  type KoboCoverRefLookup,
} from "../../../../../../cover-image";

export interface KoboImageHandlerDeps extends KoboCoverImageDeps, KoboCoverRefLookup {
  auth: KoboAuthDeps;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  log: (message: string) => void;
}

// Store-style cover proxy: initialization points the device's
// `image_url_template` here, so every cover it renders (and every Kobo store
// image it thinks it needs) arrives on this route. Unknown images answer 204
// so the device falls back to its built-in placeholder.
export function createKoboImageHandler(deps: KoboImageHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../../../../auth-helper");
    await createKoboAuth(deps.auth)(event);

    const params = event.context.params as Record<string, string>;
    const imageId = params.ImageId ?? "";
    deps.log(`[kobo] IMAGE ${imageId} (${params.Width ?? ""}x${params.Height ?? ""})`);

    const resolved = await resolveKoboCoverRef(deps, imageId);
    if (resolved === null || resolved.coverRef === null) {
      deps.log(`[kobo] IMAGE no cover found for ${imageId}`);
      return noContent();
    }

    const cover = await loadKoboCoverJpeg(deps, resolved.coverRef);
    if (cover === null) {
      deps.log(`[kobo] IMAGE cover file not found for edition ${resolved.editionId}`);
      return noContent();
    }

    deps.setResponseHeader(event, "Content-Type", "image/jpeg");
    deps.setResponseHeader(event, "Content-Length", String(cover.jpeg.length));
    deps.setResponseHeader(event, "Cache-Control", "public, max-age=86400");
    deps.log(`[kobo] IMAGE serving cover ${cover.filePath} (${String(cover.jpeg.length)} bytes jpeg)`);
    return cover.jpeg;
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createKoboImageHandler */
export default defineEventHandler(async (event) => {
  const { existsSync } = await import("node:fs");
  const { readFile } = await import("node:fs/promises");
  const { db } = await import("@bookhouse/db");
  const { toKoboId } = await import("@bookhouse/kobo");

  const handler = createKoboImageHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    coverCacheDir: process.env.COVER_CACHE_DIR ?? "/data/covers",
    findCoverRefByEditionId: async (editionId) => {
      const edition = await db.edition.findUnique({
        where: { id: editionId },
        select: { work: { select: { coverPath: true } } },
      });
      return edition?.work.coverPath ?? null;
    },
    findAllEditionCoverRefs: async () => {
      const editions = await db.edition.findMany({
        select: { id: true, work: { select: { coverPath: true } } },
      });
      return editions.map((edition) => ({ id: edition.id, coverRef: edition.work.coverPath }));
    },
    toKoboId,
    existsSync,
    readFile,
    convertToJpeg: async (webp) => {
      const sharp = (await import("sharp")).default;
      return sharp(webp).jpeg({ quality: 80 }).toBuffer();
    },
    setResponseHeader: (evt, name, value) => {
      evt.res.headers.set(name, value);
    },
    log: (message) => {
      console.log(message);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
