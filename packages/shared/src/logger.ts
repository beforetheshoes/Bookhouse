import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";

// When LOG_DIR is set, logs are written to a file there (named per LOG_SERVICE)
// in addition to stdout, so the web container can bundle both its own and the
// worker's logs for the in-app download. Kept best-effort: any file error falls
// back to stdout-only rather than taking the process down.
const MAX_LOG_BYTES = 25 * 1024 * 1024;

let fileStream: NodeJS.WritableStream | undefined;

function openLogFile(dir: string): NodeJS.WritableStream {
  if (fileStream === undefined) {
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `${process.env.LOG_SERVICE ?? "app"}.log`);
    // Single-step rotation so the file can't grow without bound between restarts.
    if (existsSync(dest) && statSync(dest).size > MAX_LOG_BYTES) {
      renameSync(dest, `${dest}.1`);
    }
    fileStream = createWriteStream(dest, { flags: "a" });
  }
  return fileStream;
}

function tryOpenLogFile(dir: string): NodeJS.WritableStream | undefined {
  try {
    return openLogFile(dir);
  } catch {
    // Permission/disk error — keep logging to stdout rather than crashing.
    return undefined;
  }
}

export function createLogger(name: string) {
  const level = process.env.LOG_LEVEL ?? "info";
  const dir = process.env.LOG_DIR;
  if (dir === undefined || dir === "") {
    return pino({ name, level });
  }
  const stream = tryOpenLogFile(dir);
  if (stream === undefined) {
    return pino({ name, level });
  }
  return pino(
    { name, level },
    pino.multistream([{ stream: process.stdout }, { stream }]),
  );
}
