import { writeFile, mkdir, rm, rename, mkdtemp } from "node:fs/promises";
import { defineEventHandler, HTTPError } from "h3";
import type { H3Event } from "h3";
import { restoreBackup as restoreBackupImpl, type RestoreBackupDeps } from "~/lib/backup/restore-backup";
import type { BackupManifest } from "~/lib/backup/manifest";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export interface UploadRestoreHandlerDeps {
  readFormData: (event: H3Event) => Promise<{ name?: string; data: Uint8Array; type?: string }[] | undefined>;
  restoreBackup: (archiveBuffer: Buffer) => Promise<{ manifest: BackupManifest }>;
  maxFileSize: number;
  requireOwner: (event: H3Event) => void;
}

export function createUploadRestoreHandler(deps: UploadRestoreHandlerDeps) {
  return async (event: H3Event) => {
    deps.requireOwner(event);
    const formData = await deps.readFormData(event);
    const fileField = formData?.find((f) => f.name === "file");

    if (!fileField?.data || fileField.data.length === 0) {
      throw new HTTPError({ status: 400, statusText: "No file uploaded" });
    }

    if (fileField.data.length > deps.maxFileSize) {
      throw new HTTPError({ status: 400, statusText: "File too large (max 2 GB)" });
    }

    const archiveBuffer = Buffer.from(fileField.data);
    const { manifest } = await deps.restoreBackup(archiveBuffer);

    return { success: true, manifest };
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createUploadRestoreHandler */
export default defineEventHandler(async (event) => {
  const coverCacheDir = process.env.COVER_CACHE_DIR ?? "/data/covers";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const psqlBin = process.env.PSQL_PATH ?? "psql";

  const { execFile: execFileCallback } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFile = promisify(execFileCallback);

  const restoreDeps: RestoreBackupDeps = {
    execFile: execFile,
    writeFile,
    mkdir: mkdir as RestoreBackupDeps["mkdir"],
    rm: rm,
    rename,
    mkdtemp,
    coverCacheDir,
    databaseUrl,
    psqlBin,
  };

  const { requireOwnerFromEvent } = await import("../../../middleware/auth");

  const handler = createUploadRestoreHandler({
    // Equivalent to the deprecated readMultipartFormData (formData + mapping).
    readFormData: async (event) => {
      const formData = await event.req.formData();
      return Promise.all(
        [...formData.entries()].map(async ([name, value]) =>
          value instanceof Blob
            ? { name, type: value.type, data: new Uint8Array(await value.arrayBuffer()) }
            : { name, data: new TextEncoder().encode(value) },
        ),
      );
    },
    restoreBackup: (buf) => restoreBackupImpl(restoreDeps, buf),
    maxFileSize: MAX_FILE_SIZE,
    requireOwner: (e) => { requireOwnerFromEvent(e); },
  });

  return handler(event);
});
