import { join } from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { ZipArchive } from "archiver";

export interface CreateLogsArchiveDeps {
  /** Directory the log files live in (shared volume between web and worker). */
  logDir: string;
  readdir: (dir: string) => Promise<string[]>;
  createReadStream: (path: string) => Readable;
}

/**
 * Bundle every log file in `logDir` into a single zip stream. Picks up the
 * current and rotated logs for each service (e.g. web.log, worker.log,
 * web.log.1). Returns an empty-but-valid archive with a README when there are
 * no logs yet, so the download never produces a broken file.
 */
export async function createLogsArchive(
  deps: CreateLogsArchiveDeps,
): Promise<Readable> {
  const entries = await deps.readdir(deps.logDir);
  const logFiles = entries.filter((name) => name.includes(".log")).sort();

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = new PassThrough();
  archive.pipe(output);

  if (logFiles.length === 0) {
    archive.append(`No log files found in ${deps.logDir}.`, {
      name: "README.txt",
    });
  } else {
    for (const name of logFiles) {
      archive.append(deps.createReadStream(join(deps.logDir, name)), { name });
    }
  }

  void archive.finalize();
  return output;
}
