import { existsSync, createReadStream } from "node:fs";
import { defineEventHandler } from "h3";
import { createCoverHandler } from "../handler";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";

export default defineEventHandler(
  createCoverHandler({
    existsSync,
    createReadStream,
    coverCacheDir: COVER_CACHE_DIR,
  }),
);
