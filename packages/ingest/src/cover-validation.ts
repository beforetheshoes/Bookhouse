export const VALID_WORK_ID = /^[a-zA-Z0-9_-]+$/;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Magic byte signatures for supported image formats
export const IMAGE_SIGNATURES: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "JPEG"],
  [[0x89, 0x50, 0x4e, 0x47], "PNG"],
  [[0x52, 0x49, 0x46, 0x46], "WebP"], // RIFF header (WebP starts with RIFF....WEBP)
  [[0x47, 0x49, 0x46, 0x38], "GIF"],
];

export function isValidImageData(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  return IMAGE_SIGNATURES.some(([sig]) => sig.every((byte, i) => data[i] === byte));
}

export function isAllowedMimeType(contentType: string | null | undefined): boolean {
  if (!contentType) return true; // Allow missing MIME if magic bytes valid
  return ALLOWED_MIME_TYPES.has(contentType);
}
