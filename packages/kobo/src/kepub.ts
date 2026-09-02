import { createHash, randomBytes } from "node:crypto";
import { join, basename } from "node:path";

export interface KepubConvertDeps {
  execFile: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  /** Atomic move of the finished conversion into its cache slot. */
  rename: (from: string, to: string) => Promise<void>;
}

/**
 * The cache slot for a source EPUB. `fingerprint` is the file's content hash
 * (or size+mtime) so a book re-downloaded or re-edited at the same path gets
 * a fresh conversion instead of the stale one forever.
 */
export function getKepubCachePath(
  cacheDir: string,
  epubPath: string,
  fingerprint = "",
): string {
  const hash = createHash("sha256").update(`${epubPath}\n${fingerprint}`).digest("hex").slice(0, 16);
  const name = basename(epubPath, ".epub");
  return join(cacheDir, `${name}-${hash}.kepub.epub`);
}

// Two devices asking for the same unconverted book at once used to run two
// kepubify processes writing the same output path, and one of them streamed
// a half-written file. One conversion per slot; the others await it.
const inflight = new Map<string, Promise<string>>();

export async function convertToKepub(
  epubPath: string,
  cacheDir: string,
  deps: KepubConvertDeps,
  fingerprint = "",
): Promise<string> {
  const outputPath = getKepubCachePath(cacheDir, epubPath, fingerprint);

  if (deps.existsSync(outputPath)) {
    return outputPath;
  }

  const pending = inflight.get(outputPath);
  if (pending) {
    return pending;
  }

  const conversion = (async () => {
    deps.mkdirSync(cacheDir, { recursive: true });

    // Write to a temp name and rename into place so a reader never sees a
    // partial file and a crash mid-conversion leaves no poisoned cache entry.
    const tempPath = `${outputPath}.${randomBytes(6).toString("hex")}.tmp`;
    await deps.execFile("kepubify", ["-o", tempPath, epubPath]);

    // kepubify can exit 0 without producing output (e.g. an unsupported input or
    // a write failure). Verify the file actually exists so callers can fall back
    // to the original EPUB instead of serving a path that 404s on disk.
    if (!deps.existsSync(tempPath)) {
      throw new Error(`kepubify did not produce output at ${tempPath}`);
    }

    await deps.rename(tempPath, outputPath);
    return outputPath;
  })();

  inflight.set(outputPath, conversion);
  try {
    return await conversion;
  } finally {
    inflight.delete(outputPath);
  }
}
