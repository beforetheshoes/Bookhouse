import { writeFile, mkdir, rm, rename, mkdtemp } from "node:fs/promises";
import { defineEventHandler, readMultipartFormData, createError } from "h3";
import type { H3Event } from "h3";
import { restoreBackup as restoreBackupImpl, type RestoreBackupDeps } from "~/lib/backup/restore-backup";
import type { BackupManifest } from "~/lib/backup/manifest";

const COVER_CACHE_DIR = process.env.COVER_CACHE_DIR ?? "/data/covers";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const PSQL_BIN = process.env.PSQL_PATH ?? "psql";
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export interface UploadRestoreHandlerDeps {
  readFormData: (event: H3Event) => Promise<{ name?: string; data: Uint8Array; type?: string }[] | undefined>;
  restoreBackup: (archiveBuffer: Buffer) => Promise<{ manifest: BackupManifest }>;
  maxFileSize: number;
}

export function createUploadRestoreHandler(deps: UploadRestoreHandlerDeps) {
  return async (event: H3Event) => {
    const formData = await deps.readFormData(event);
    const fileField = formData?.find((f) => f.name === "file");

    if (!fileField?.data || fileField.data.length === 0) {
      throw createError({ statusCode: 400, statusMessage: "No file uploaded" });
    }

    if (fileField.data.length > deps.maxFileSize) {
      throw createError({ statusCode: 400, statusMessage: "File too large (max 2 GB)" });
    }

    const archiveBuffer = Buffer.from(fileField.data);
    const { manifest } = await deps.restoreBackup(archiveBuffer);

    return { success: true, manifest };
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createUploadRestoreHandler */
export default defineEventHandler(async (event) => {
  const { execFile: execFileCallback } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFile = promisify(execFileCallback);

  const restoreDeps: RestoreBackupDeps = {
    execFile: execFile as unknown as RestoreBackupDeps["execFile"],
    writeFile,
    mkdir: mkdir as unknown as RestoreBackupDeps["mkdir"],
    rm: rm as unknown as RestoreBackupDeps["rm"],
    rename,
    mkdtemp,
    coverCacheDir: COVER_CACHE_DIR,
    databaseUrl: DATABASE_URL,
    psqlBin: PSQL_BIN,
  };

  const handler = createUploadRestoreHandler({
    readFormData: readMultipartFormData as unknown as UploadRestoreHandlerDeps["readFormData"],
    restoreBackup: (buf) => restoreBackupImpl(restoreDeps, buf),
    maxFileSize: MAX_FILE_SIZE,
  });

  return handler(event);
});
