import { existsSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { defineEventHandler, setResponseHeader } from "h3";
import { createCoverHandler } from "../handler";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export default defineEventHandler(
  createCoverHandler({
    existsSync,
    createReadStream,
    coverCacheDir: COVER_CACHE_DIR,
    setResponseHeader,
    sendStream: (_event, stream) =>
      Readable.toWeb(stream as Readable) as ReadableStream,
  }),
);
