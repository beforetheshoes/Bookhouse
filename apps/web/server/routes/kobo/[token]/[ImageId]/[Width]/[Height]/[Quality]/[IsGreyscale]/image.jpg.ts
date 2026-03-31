import { defineEventHandler, setResponseHeader, sendNoContent } from "h3";
import nodePath from "node:path";

const IS_CUID = /^c[a-z0-9]{24}$/;
const IS_CUID_VERSIONED = /^(c[a-z0-9]{24})-v\d+$/;
const IS_UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* c8 ignore start — Kobo store cover image proxy; returns 204 for unknown images */
export default defineEventHandler(async (event) => {
  const params = event.context.params as Record<string, string>;
  const imageId = params.ImageId ?? "";

  console.log(`[kobo] IMAGE ${imageId} (${params.Width}x${params.Height})`);

  const { db } = await import("@bookhouse/db");
  const { existsSync, createReadStream, statSync } = await import("node:fs");
  const { Readable } = await import("node:stream");
  const { sendStream } = await import("h3");

  let coverRef: string | null = null;

  // Strip version suffix (e.g., "cmn9jp...-v2" → "cmn9jp...")
  const versionMatch = IS_CUID_VERSIONED.exec(imageId);
  const lookupId = versionMatch ? versionMatch[1] : imageId;

  if (IS_CUID.test(lookupId)) {
    // Direct edition ID lookup
    const edition = await db.edition.findUnique({
      where: { id: lookupId },
      include: { work: true },
    });
    coverRef = edition?.work.coverPath ?? null;
  } else if (IS_UUID_LIKE.test(imageId)) {
    // Legacy: old syncs used toKoboId(editionId) which is a SHA-256 derived UUID.
    // Look up by scanning editions and matching the hash.
    const { toKoboId } = await import("@bookhouse/kobo");
    const editions = await db.edition.findMany({
      select: { id: true, work: { select: { coverPath: true } } },
    });
    const match = editions.find((e) => toKoboId(e.id) === imageId);
    coverRef = match?.work.coverPath ?? null;
    if (match) {
      console.log(`[kobo] IMAGE resolved legacy UUID ${imageId} → edition ${match.id}`);
    }
  }

  if (coverRef) {
    const coverCacheDir = process.env.COVER_CACHE_DIR ?? "/data/covers";
    const coverFile = nodePath.join(coverCacheDir, coverRef, "medium.webp");

    if (existsSync(coverFile)) {
      // Kobo e-readers don't support WebP — convert to JPEG
      const sharp = (await import("sharp")).default;
      const jpegBuffer = await sharp(coverFile).jpeg({ quality: 80 }).toBuffer();
      setResponseHeader(event, "Content-Type", "image/jpeg");
      setResponseHeader(event, "Content-Length", String(jpegBuffer.length));
      setResponseHeader(event, "Cache-Control", "public, max-age=86400");
      console.log(`[kobo] IMAGE serving cover ${coverFile} (${jpegBuffer.length} bytes jpeg)`);
      return jpegBuffer;
    }
    console.log(`[kobo] IMAGE cover file not found: ${coverFile}`);
  } else {
    console.log(`[kobo] IMAGE no cover found for ${imageId}`);
  }

  // For Kobo store images or missing covers, return 204 No Content
  return sendNoContent(event);
});
/* c8 ignore stop */
