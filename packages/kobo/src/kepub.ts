import { createHash } from "node:crypto";
import { join, basename } from "node:path";

export interface KepubConvertDeps {
  execFile: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
}

export function getKepubCachePath(
  cacheDir: string,
  epubPath: string,
): string {
  const hash = createHash("sha256").update(epubPath).digest("hex").slice(0, 16);
  const name = basename(epubPath, ".epub");
  return join(cacheDir, `${name}-${hash}.kepub.epub`);
}

export async function convertToKepub(
  epubPath: string,
  cacheDir: string,
  deps: KepubConvertDeps,
): Promise<string> {
  const outputPath = getKepubCachePath(cacheDir, epubPath);

  if (deps.existsSync(outputPath)) {
    return outputPath;
  }

  deps.mkdirSync(cacheDir, { recursive: true });

  await deps.execFile("kepubify", ["-o", outputPath, epubPath]);

  return outputPath;
}
