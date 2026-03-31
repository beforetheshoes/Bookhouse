import { defineEventHandler, setResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../../auth-helper";

export interface CoverHandlerDeps {
  auth: KoboAuthDeps;
  findCoverPath: (editionId: string) => Promise<string | null>;
  existsSync: (path: string) => boolean;
  createReadStream: (path: string) => NodeJS.ReadableStream;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => unknown;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createCoverHandler(deps: CoverHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    await auth(event);

    const params = event.context.params as Record<string, string>;
    const bookId = params.bookId as string;

    if (!VALID_ID.test(bookId)) {
      throw Object.assign(new Error("Invalid bookId"), {
        statusCode: 400,
        statusMessage: "Invalid bookId",
      });
    }

    const coverPath = await deps.findCoverPath(bookId);

    if (!coverPath || !deps.existsSync(coverPath)) {
      throw Object.assign(new Error("Cover not found"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    deps.setResponseHeader(event, "Content-Type", "image/jpeg");
    deps.setResponseHeader(event, "Cache-Control", "public, max-age=86400");

    return deps.sendStream(event, deps.createReadStream(coverPath));
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const fs = await import("node:fs");
  const stream = await import("node:stream");
  const h3 = await import("h3");
  const { db } = await import("@bookhouse/db");

  const handler = createCoverHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    findCoverPath: async (editionId) => {
      const path = await import("node:path");
      const edition = await db.edition.findUnique({
        where: { id: editionId },
        include: { work: true },
      });
      const coverRef = edition?.work.coverPath;
      if (!coverRef) return null;
      const coverCacheDir = process.env.COVER_CACHE_DIR ?? "/data/covers";
      return path.join(coverCacheDir, coverRef, "medium.webp");
    },
    existsSync: fs.existsSync,
    createReadStream: fs.createReadStream,
    setResponseHeader,
    sendStream: (evt, s) =>
      h3.sendStream(evt, stream.Readable.toWeb(s as InstanceType<typeof stream.Readable>) as ReadableStream),
  });

  return handler(event);
});
/* c8 ignore stop */
