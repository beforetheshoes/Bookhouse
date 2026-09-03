import path from "node:path";

// Kobo devices request covers two ways: the per-book `/v1/library/{id}/cover`
// URL and the store-style `/{ImageId}/{Width}/{Height}/.../image.jpg` URL
// advertised by initialization. Both resolve a Work's cover cache directory
// and both must deliver JPEG — Kobo e-readers don't decode WebP, which is
// the only format the cover cache stores.

export interface KoboCoverImageDeps {
  coverCacheDir: string;
  existsSync: (filePath: string) => boolean;
  readFile: (filePath: string) => Promise<Buffer>;
  convertToJpeg: (webp: Buffer) => Promise<Buffer>;
}

const IS_CUID = /^c[a-z0-9]{24}$/;
const IS_CUID_VERSIONED = /^(c[a-z0-9]{24})-v\d+$/;
const IS_UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface KoboCoverRefLookup {
  findCoverRefByEditionId: (editionId: string) => Promise<string | null>;
  findAllEditionCoverRefs: () => Promise<{ id: string; coverRef: string | null }[]>;
  toKoboId: (editionId: string) => string;
}

export interface ResolvedKoboCoverRef {
  editionId: string;
  coverRef: string | null;
}

/**
 * Map a Kobo `ImageId` to the edition it names and that edition's cover ref.
 * Accepts the current `${editionId}-vN` form, a bare edition id, and the
 * legacy SHA-256 UUID that older syncs advertised. Returns null for ids that
 * are none of those (Kobo store images the device also asks us for).
 */
export async function resolveKoboCoverRef(
  lookup: KoboCoverRefLookup,
  imageId: string,
): Promise<ResolvedKoboCoverRef | null> {
  const versionMatch = IS_CUID_VERSIONED.exec(imageId);
  const editionId = versionMatch ? (versionMatch[1] as string) : imageId;

  if (IS_CUID.test(editionId)) {
    return { editionId, coverRef: await lookup.findCoverRefByEditionId(editionId) };
  }

  if (IS_UUID_LIKE.test(imageId)) {
    const editions = await lookup.findAllEditionCoverRefs();
    const match = editions.find((edition) => lookup.toKoboId(edition.id) === imageId);
    return match ? { editionId: match.id, coverRef: match.coverRef } : null;
  }

  return null;
}

export function koboCoverFilePath(coverCacheDir: string, coverRef: string): string {
  return path.join(coverCacheDir, coverRef, "medium.webp");
}

/**
 * Load the medium cover for a cover ref and transcode it to JPEG. Returns
 * null when the cache has no file for the ref.
 */
export async function loadKoboCoverJpeg(
  deps: KoboCoverImageDeps,
  coverRef: string,
): Promise<{ filePath: string; jpeg: Buffer } | null> {
  const filePath = koboCoverFilePath(deps.coverCacheDir, coverRef);
  if (!deps.existsSync(filePath)) {
    return null;
  }
  const webp = await deps.readFile(filePath);
  return { filePath, jpeg: await deps.convertToJpeg(webp) };
}
