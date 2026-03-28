import { existsSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { defineEventHandler, setResponseHeader, sendStream } from "h3";
import { createCoverHandler } from "../handler";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export default defineEventHandler(
  createCoverHandler({
    existsSync,
    createReadStream,
    coverCacheDir: COVER_CACHE_DIR,
    setResponseHeader,
    sendStream: (event, stream) =>
      sendStream(event, Readable.toWeb(stream as Readable) as ReadableStream),
  }),
);
