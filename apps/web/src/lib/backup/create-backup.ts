import path from "node:path";
import { createGzip } from "node:zlib";
import type { Dirent } from "node:fs";
import type { Readable } from "node:stream";
import { pack as tarPack } from "tar-stream";
import { parseDatabaseUrl } from "./parse-database-url";
import type { BackupManifest } from "./manifest";

export interface CreateBackupDeps {
  execFile: (cmd: string, args: string[], opts: object) => Promise<{ stdout: Buffer }>;
  readdir: (dirPath: string, opts: { withFileTypes: true }) => Promise<Dirent[]>;
  readFile: (filePath: string) => Promise<Buffer>;
  stat: (filePath: string) => Promise<{ size: number }>;
  coverCacheDir: string;
  databaseUrl: string;
  pgDumpBin: string;
}

interface CoverFile {
  archivePath: string;
  absolutePath: string;
  size: number;
}

async function walkCovers(
  deps: Pick<CreateBackupDeps, "readdir" | "stat">,
  dirPath: string,
  prefix: string,
): Promise<CoverFile[]> {
  const entries = await deps.readdir(dirPath, { withFileTypes: true });
  const files: CoverFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const archivePath = `${prefix}/${entry.name}`;

    if (entry.isFile()) {
      const { size } = await deps.stat(fullPath);
      files.push({ archivePath, absolutePath: fullPath, size });
    } else {
      const nested = await walkCovers(deps, fullPath, archivePath);
      files.push(...nested);
    }
  }

  return files;
}

export async function createBackup(
  deps: CreateBackupDeps,
): Promise<{ stream: Readable; manifest: BackupManifest }> {
  const conn = parseDatabaseUrl(deps.databaseUrl);

  const { stdout: dumpBuffer } = await deps.execFile(
    deps.pgDumpBin,
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      `--host=${conn.host}`,
      `--port=${String(conn.port)}`,
      `--username=${conn.user}`,
      conn.database,
    ],
    {
      env: { ...process.env, PGPASSWORD: conn.password },
      maxBuffer: 512 * 1024 * 1024,
      encoding: "buffer",
    },
  );

  const coverFiles = await walkCovers(deps, deps.coverCacheDir, "covers");

  const manifest: BackupManifest = {
    version: 1,
    timestamp: new Date().toISOString(),
    databaseSize: dumpBuffer.length,
    coverCount: coverFiles.length,
    coverSize: coverFiles.reduce((sum, f) => sum + f.size, 0),
  };

  const pack = tarPack();

  pack.entry({ name: "manifest.json" }, JSON.stringify(manifest));
  pack.entry({ name: "database.sql", size: dumpBuffer.length }, dumpBuffer);

  const addCovers = async () => {
    for (const file of coverFiles) {
      const data = await deps.readFile(file.absolutePath);
      pack.entry({ name: file.archivePath, size: data.length }, data);
    }
    pack.finalize();
  };

  void addCovers();

  const gzip = createGzip();
  const stream = pack.pipe(gzip) as Readable;

  return { stream, manifest };
}
