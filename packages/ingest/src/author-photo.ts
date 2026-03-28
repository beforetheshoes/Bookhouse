import path from "node:path";
import { VALID_WORK_ID, MAX_FILE_SIZE, isValidImageData, isAllowedMimeType } from "./cover-validation";

const MIN_PHOTO_SIZE = 100;

export interface AuthorPhotoDeps {
  fetchUrl: (url: string) => Promise<{ buffer: Buffer; contentType: string | null }>;
  resizeAndSave: (imageBuffer: Buffer, outputDir: string) => Promise<void>;
}

export interface AuthorPhotoDbDeps {
  findContributor: (id: string) => Promise<{ id: string } | null>;
  updateContributor: (id: string, data: { imagePath: string }) => Promise<void>;
}

export interface AuthorPhotoInput {
  contributorId: string;
  imageUrl: string;
  coverCacheDir: string;
}

export interface AuthorPhotoResult {
  success: boolean;
}

export async function applyAuthorPhotoFromUrl(
  input: AuthorPhotoInput,
  deps: AuthorPhotoDeps,
  db: AuthorPhotoDbDeps,
): Promise<AuthorPhotoResult> {
  const { contributorId, imageUrl, coverCacheDir } = input;

  if (!VALID_WORK_ID.test(contributorId)) {
    throw new Error("Invalid contributorId");
  }

  const { buffer, contentType } = await deps.fetchUrl(imageUrl);

  if (buffer.length < MIN_PHOTO_SIZE) {
    throw new Error("Image too small (likely a placeholder)");
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("Image too large (max 10 MB)");
  }

  if (!isAllowedMimeType(contentType)) {
    throw new Error("Invalid image type");
  }

  if (!isValidImageData(buffer)) {
    throw new Error("File is not a valid image");
  }

  const outputDir = path.join(coverCacheDir, "authors", contributorId);
  await deps.resizeAndSave(buffer, outputDir);

  const contributor = await db.findContributor(contributorId);
  if (!contributor) {
    throw new Error("Contributor not found");
  }

  await db.updateContributor(contributorId, { imagePath: contributorId });

  return { success: true };
}
