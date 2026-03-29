/* c8 ignore start — runtime wiring, tested via unit tests on createDownloadAllHandler */
import { existsSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { PassThrough } from "node:stream";
import { defineEventHandler, setResponseHeader, sendStream } from "h3";
import archiver from "archiver";
import { createDownloadAllHandler } from "../download-all-handler";

export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createDownloadAllHandler({
    db: {
      findEditionFiles: (editionId) =>
        db.editionFile.findMany({
          where: { editionId },
          select: {
            id: true,
            fileAsset: {
              select: {
                absolutePath: true,
                basename: true,
                mimeType: true,
                mediaKind: true,
                availabilityStatus: true,
              },
            },
          },
        }),
    },
    existsSync,
    createReadStream,
    createArchive: () => {
      const archive = archiver("zip", { zlib: { level: 0 } });
      return archive as unknown as PassThrough & {
        append: (source: NodeJS.ReadableStream, opts: { name: string }) => unknown;
        finalize: () => Promise<void>;
      };
    },
    setResponseHeader,
    sendStream: (event, stream) =>
      sendStream(event, Readable.toWeb(stream as Readable) as ReadableStream),
  });

  return handler(event);
});
/* c8 ignore stop */
