import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { defineEventHandler, setResponseHeader, sendStream } from "h3";
import { createCoverHandler } from "../../../api/covers/handler";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export default defineEventHandler(
  createCoverHandler({
    existsSync,
    createReadStream,
    coverCacheDir: path.join(COVER_CACHE_DIR, "authors"),
    setResponseHeader,
    sendStream: (event, stream) =>
      sendStream(event, Readable.toWeb(stream as Readable) as ReadableStream),
    idParamName: "contributorId",
  }),
);
