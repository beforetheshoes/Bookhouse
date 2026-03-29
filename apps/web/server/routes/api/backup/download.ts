import { readdir, readFile, stat } from "node:fs/promises";
import { defineEventHandler, setResponseHeader, sendStream } from "h3";
import type { H3Event } from "h3";
import type { Readable } from "node:stream";
import { createBackup as createBackupImpl, type CreateBackupDeps } from "~/lib/backup/create-backup";
import type { BackupManifest } from "~/lib/backup/manifest";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const PG_DUMP_BIN = process.env.PG_DUMP_PATH ?? "pg_dump";

export interface DownloadHandlerDeps {
  createBackup: () => Promise<{ stream: Readable; manifest: BackupManifest }>;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: Readable) => unknown;
}

export function createDownloadHandler(deps: DownloadHandlerDeps) {
  return async (event: H3Event) => {
    const { stream, manifest } = await deps.createBackup();

    const filename = `bookhouse-backup-${manifest.timestamp}.tar.gz`;

    deps.setResponseHeader(event, "Content-Type", "application/gzip");
    deps.setResponseHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);

    return deps.sendStream(event, stream);
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createDownloadHandler */
export default defineEventHandler(async (event) => {
  const { execFile: execFileCallback } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFile = promisify(execFileCallback);

  const handler = createDownloadHandler({
    createBackup: () =>
      createBackupImpl({
        execFile: execFile as unknown as CreateBackupDeps["execFile"],
        readdir: readdir as unknown as CreateBackupDeps["readdir"],
        readFile,
        stat,
        coverCacheDir: COVER_CACHE_DIR,
        databaseUrl: DATABASE_URL,
        pgDumpBin: PG_DUMP_BIN,
      }),
    setResponseHeader,
    sendStream: sendStream as unknown as DownloadHandlerDeps["sendStream"],
  });
  return handler(event);
});
