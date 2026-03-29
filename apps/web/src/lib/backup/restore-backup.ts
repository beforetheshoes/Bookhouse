import path from "node:path";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { extract as tarExtract } from "tar-stream";
import { parseDatabaseUrl } from "./parse-database-url";
import { backupManifestSchema, type BackupManifest } from "./manifest";

export interface RestoreBackupDeps {
  execFile: (cmd: string, args: string[], opts: object) => Promise<{ stdout: string }>;
  writeFile: (filePath: string, data: Buffer) => Promise<void>;
  mkdir: (dirPath: string, opts: { recursive: true }) => Promise<void>;
  rm: (filePath: string, opts: { recursive?: boolean; force: boolean }) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  mkdtemp: (prefix: string) => Promise<string>;
  coverCacheDir: string;
  databaseUrl: string;
  psqlBin: string;
}

interface ExtractedArchive {
  manifest: BackupManifest;
  databaseSql: Buffer;
  coverFiles: { archivePath: string; data: Buffer }[];
}

function isPathTraversal(entryName: string): boolean {
  if (path.isAbsolute(entryName)) return true;
  const normalized = path.normalize(entryName);
  return normalized.startsWith("..") || normalized.includes("/..");
}

function extractArchive(data: Buffer): Promise<ExtractedArchive> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const extractor = tarExtract();

    let manifestBuffer: Buffer | undefined;
    let databaseSql: Buffer | undefined;
    const coverFiles: { archivePath: string; data: Buffer }[] = [];

    extractor.on("entry", (header, entryStream, next) => {
      const chunks: Buffer[] = [];
      entryStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      entryStream.on("end", () => {
        const body = Buffer.concat(chunks);
        const name = header.name;

        if (isPathTraversal(name)) {
          reject(new Error(`Unsafe path traversal detected: ${name}`));
          return;
        }

        if (name === "manifest.json") {
          manifestBuffer = body;
        } else if (name === "database.sql") {
          databaseSql = body;
        } else if (name.startsWith("covers/")) {
          coverFiles.push({ archivePath: name, data: body });
        }

        next();
      });
    });

    extractor.on("finish", () => {
      if (!manifestBuffer) {
        reject(new Error("Archive is missing manifest.json"));
        return;
      }

      let manifest: BackupManifest;
      try {
        const raw = JSON.parse(manifestBuffer.toString()) as Record<string, number | string>;
        manifest = backupManifestSchema.parse(raw);
      } catch (err) {
        reject(err as Error);
        return;
      }

      if (!databaseSql) {
        reject(new Error("Archive is missing database.sql"));
        return;
      }

      resolve({ manifest, databaseSql, coverFiles });
    });

    extractor.on("error", reject);
    gunzip.on("error", reject);

    Readable.from(data).pipe(gunzip).pipe(extractor);
  });
}

export async function restoreBackup(
  deps: RestoreBackupDeps,
  archiveBuffer: Buffer,
): Promise<{ manifest: BackupManifest }> {
  const { manifest, databaseSql, coverFiles } = await extractArchive(archiveBuffer);
  const conn = parseDatabaseUrl(deps.databaseUrl);

  // Write database dump to temp file
  const tempDir = await deps.mkdtemp("bookhouse-restore-");
  const dumpPath = path.join(tempDir, "database.sql");
  await deps.writeFile(dumpPath, databaseSql);

  // Write cover files to temp directory
  const tempCoversDir = path.join(tempDir, "covers");
  await deps.mkdir(tempCoversDir, { recursive: true });

  for (const file of coverFiles) {
    const relativePath = file.archivePath.replace(/^covers\//, "");
    const targetPath = path.join(tempCoversDir, relativePath);
    const targetDir = path.dirname(targetPath);
    await deps.mkdir(targetDir, { recursive: true });
    await deps.writeFile(targetPath, file.data);
  }

  // Restore database
  await deps.execFile(
    deps.psqlBin,
    [
      `--host=${conn.host}`,
      `--port=${String(conn.port)}`,
      `--username=${conn.user}`,
      `--dbname=${conn.database}`,
      `--file=${dumpPath}`,
      "--quiet",
    ],
    {
      env: { ...process.env, PGPASSWORD: conn.password },
    },
  );

  // Atomic swap of covers directory
  const oldCoversPath = `${deps.coverCacheDir}-old-${String(Date.now())}`;
  try {
    await deps.rename(deps.coverCacheDir, oldCoversPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err as Error;
    // coverCacheDir doesn't exist yet (fresh install), nothing to move out of the way
  }
  await deps.rename(tempCoversDir, deps.coverCacheDir);
  await deps.rm(oldCoversPath, { recursive: true, force: true });

  // Clean up temp database file
  await deps.rm(dumpPath, { force: true });

  return { manifest };
}
