/* c8 ignore start — runtime wiring, tested via unit tests on createDownloadAllHandler */
import { existsSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { defineEventHandler, setResponseHeader } from "h3";
import { ZipArchive } from "archiver";
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
      const archive = new ZipArchive({ zlib: { level: 0 } });
      // archiver's Archiver type can't be structurally narrowed to the handler's
      // archive interface without an `unknown` bridge (TS requires it).
      // eslint-disable-next-line no-restricted-syntax
      return archive as unknown as NodeJS.ReadableStream & {
        append: (source: NodeJS.ReadableStream, opts: { name: string }) => void;
        finalize: () => Promise<void>;
      };
    },
    setResponseHeader,
    sendStream: (_event, stream) =>
      Readable.toWeb(stream) as ReadableStream,
  });

  return handler(event);
});
/* c8 ignore stop */
