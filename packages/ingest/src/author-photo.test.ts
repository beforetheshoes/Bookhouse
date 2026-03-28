import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyAuthorPhotoFromUrl, type AuthorPhotoDeps, type AuthorPhotoDbDeps } from "./author-photo";

// JPEG header followed by padding to exceed MIN_PHOTO_SIZE (100 bytes)
const VALID_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(200)]);

function createMockDeps(overrides: Partial<AuthorPhotoDeps> = {}): AuthorPhotoDeps {
  return {
    fetchUrl: vi.fn().mockResolvedValue({ buffer: VALID_JPEG, contentType: "image/jpeg" }),
    resizeAndSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockDb(overrides: Partial<AuthorPhotoDbDeps> = {}): AuthorPhotoDbDeps {
  return {
    findContributor: vi.fn().mockResolvedValue({ id: "c1" }),
    updateContributor: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("applyAuthorPhotoFromUrl", () => {
  let deps: AuthorPhotoDeps;
  let db: AuthorPhotoDbDeps;

  beforeEach(() => {
    deps = createMockDeps();
    db = createMockDb();
  });

  it("downloads, resizes, and updates the contributor", async () => {
    const result = await applyAuthorPhotoFromUrl(
      { contributorId: "c1", imageUrl: "https://covers.openlibrary.org/a/olid/OL1A-M.jpg", coverCacheDir: "/data/covers" },
      deps,
      db,
    );

    expect(deps.fetchUrl).toHaveBeenCalledWith("https://covers.openlibrary.org/a/olid/OL1A-M.jpg");
    expect(deps.resizeAndSave).toHaveBeenCalledWith(expect.any(Buffer) as Buffer, "/data/covers/authors/c1");
    expect(db.updateContributor).toHaveBeenCalledWith("c1", { imagePath: "c1" });
    expect(result).toEqual({ success: true });
  });

  it("throws for invalid contributorId", async () => {
    await expect(
      applyAuthorPhotoFromUrl(
        { contributorId: "../etc/passwd", imageUrl: "https://example.com/photo.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("Invalid contributorId");
  });

  it("throws when fetched content exceeds 10 MB", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: Buffer.alloc(11 * 1024 * 1024), contentType: "image/jpeg" }),
    });

    await expect(
      applyAuthorPhotoFromUrl(
        { contributorId: "c1", imageUrl: "https://example.com/huge.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("too large");
  });

  it("throws when content-type is not an allowed image type", async () => {
    const largeBuffer = Buffer.concat([VALID_JPEG]);
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: largeBuffer, contentType: "application/pdf" }),
    });

    await expect(
      applyAuthorPhotoFromUrl(
        { contributorId: "c1", imageUrl: "https://example.com/file.pdf", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("Invalid image type");
  });

  it("throws when fetched content has bad magic bytes", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: Buffer.alloc(200, 0x42), contentType: "image/jpeg" }),
    });

    await expect(
      applyAuthorPhotoFromUrl(
        { contributorId: "c1", imageUrl: "https://example.com/fake.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("not a valid image");
  });

  it("throws when image is too small (OL placeholder)", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: Buffer.alloc(50), contentType: "image/jpeg" }),
    });

    await expect(
      applyAuthorPhotoFromUrl(
        { contributorId: "c1", imageUrl: "https://example.com/tiny.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("too small");
  });

  it("throws when contributor is not found", async () => {
    db = createMockDb({ findContributor: vi.fn().mockResolvedValue(null) });

    await expect(
      applyAuthorPhotoFromUrl(
        { contributorId: "c1", imageUrl: "https://example.com/photo.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("Contributor not found");
  });

  it("allows missing content-type if magic bytes are valid", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: VALID_JPEG, contentType: null }),
    });

    const result = await applyAuthorPhotoFromUrl(
      { contributorId: "c1", imageUrl: "https://example.com/photo", coverCacheDir: "/data/covers" },
      deps,
      db,
    );

    expect(result).toEqual({ success: true });
  });
});
