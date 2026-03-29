/* c8 ignore start — runtime wiring, tested via unit tests on createFileDownloadHandler */
import { existsSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { defineEventHandler, setResponseHeader, sendStream } from "h3";
import { createFileDownloadHandler } from "../handler";

export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createFileDownloadHandler({
    db: {
      findEditionFile: (id) =>
        db.editionFile.findUnique({
          where: { id },
          select: {
            fileAsset: {
              select: {
                absolutePath: true,
                basename: true,
                mimeType: true,
                availabilityStatus: true,
              },
            },
          },
        }),
    },
    existsSync,
    createReadStream,
    setResponseHeader,
    sendStream: (event, stream) =>
      sendStream(event, Readable.toWeb(stream as Readable) as ReadableStream),
  });

  return handler(event);
});
/* c8 ignore stop */
