import path from "node:path";
import { VALID_WORK_ID, MAX_FILE_SIZE, isValidImageData, isAllowedMimeType } from "./cover-validation";

export interface CoverFromUrlDeps {
  fetchUrl: (url: string) => Promise<{ buffer: Buffer; contentType: string | null }>;
  resizeAndSave: (imageBuffer: Buffer, outputDir: string) => Promise<void>;
  extractColors: (imageBuffer: Buffer) => Promise<string[]>;
}

export interface CoverFromUrlDbDeps {
  findWork: (id: string) => Promise<{ editedFields: string[] } | null>;
  updateWork: (
    id: string,
    data: { coverPath: string; editedFields: string[]; coverColors?: string[] },
  ) => Promise<void>;
}

export interface CoverFromUrlInput {
  workId: string;
  imageUrl: string;
  coverCacheDir: string;
}

export interface CoverFromUrlResult {
  success: boolean;
}

export async function applyCoverFromUrl(
  input: CoverFromUrlInput,
  deps: CoverFromUrlDeps,
  db: CoverFromUrlDbDeps,
): Promise<CoverFromUrlResult> {
  const { workId, imageUrl, coverCacheDir } = input;

  if (!VALID_WORK_ID.test(workId)) {
    throw new Error("Invalid workId");
  }

  const { buffer, contentType } = await deps.fetchUrl(imageUrl);

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("Image too large (max 10 MB)");
  }

  if (!isAllowedMimeType(contentType)) {
    throw new Error("Invalid image type");
  }

  if (!isValidImageData(buffer)) {
    throw new Error("File is not a valid image");
  }

  const outputDir = path.join(coverCacheDir, workId);
  await deps.resizeAndSave(buffer, outputDir);

  let coverColors: string[] | undefined;
  try {
    coverColors = await deps.extractColors(buffer);
  } catch {
    // Color extraction is non-critical — proceed without
  }

  const work = await db.findWork(workId);
  if (!work) {
    throw new Error("Work not found");
  }

  const mergedEdited = [...new Set([...work.editedFields, "coverPath"])];
  await db.updateWork(workId, { coverPath: workId, editedFields: mergedEdited, coverColors });

  return { success: true };
}
