import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyCoverFromUrl, type CoverFromUrlDeps, type CoverFromUrlDbDeps } from "./cover-from-url";

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function createMockDeps(overrides: Partial<CoverFromUrlDeps> = {}): CoverFromUrlDeps {
  return {
    fetchUrl: vi.fn().mockResolvedValue({ buffer: VALID_JPEG, contentType: "image/jpeg" }),
    resizeAndSave: vi.fn().mockResolvedValue(undefined),
    extractColors: vi.fn().mockResolvedValue(["#1a2b3c", "#4d5e6f", "#a0b1c2"]),
    ...overrides,
  };
}

function createMockDb(overrides: Partial<CoverFromUrlDbDeps> = {}): CoverFromUrlDbDeps {
  return {
    findWork: vi.fn().mockResolvedValue({ editedFields: [] }),
    updateWork: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("applyCoverFromUrl", () => {
  let deps: CoverFromUrlDeps;
  let db: CoverFromUrlDbDeps;

  beforeEach(() => {
    deps = createMockDeps();
    db = createMockDb();
  });

  it("downloads, resizes, extracts colors, and updates the work", async () => {
    const result = await applyCoverFromUrl(
      { workId: "work-1", imageUrl: "https://example.com/cover.jpg", coverCacheDir: "/data/covers" },
      deps,
      db,
    );

    expect(deps.fetchUrl).toHaveBeenCalledWith("https://example.com/cover.jpg");
    expect(deps.resizeAndSave).toHaveBeenCalledWith(expect.any(Buffer) as Buffer, "/data/covers/work-1");
    expect(deps.extractColors).toHaveBeenCalledWith(expect.any(Buffer) as Buffer);
    expect(db.updateWork).toHaveBeenCalledWith("work-1", {
      coverPath: "work-1",
      editedFields: ["coverPath"],
      coverColors: ["#1a2b3c", "#4d5e6f", "#a0b1c2"],
    });
    expect(result).toEqual({ success: true });
  });

  it("throws for invalid workId", async () => {
    await expect(
      applyCoverFromUrl(
        { workId: "../etc/passwd", imageUrl: "https://example.com/cover.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("Invalid workId");
  });

  it("throws when fetched content has bad magic bytes", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: Buffer.from("not an image"), contentType: "image/jpeg" }),
    });

    await expect(
      applyCoverFromUrl(
        { workId: "work-1", imageUrl: "https://example.com/fake.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("not a valid image");
  });

  it("throws when fetched content exceeds 10 MB", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: Buffer.alloc(11 * 1024 * 1024), contentType: "image/jpeg" }),
    });

    await expect(
      applyCoverFromUrl(
        { workId: "work-1", imageUrl: "https://example.com/huge.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("too large");
  });

  it("throws when content-type is not an allowed image type", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: VALID_JPEG, contentType: "application/pdf" }),
    });

    await expect(
      applyCoverFromUrl(
        { workId: "work-1", imageUrl: "https://example.com/file.pdf", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("Invalid image type");
  });

  it("proceeds without colors when extractColors fails", async () => {
    deps = createMockDeps({
      extractColors: vi.fn().mockRejectedValue(new Error("sharp crash")),
    });

    const result = await applyCoverFromUrl(
      { workId: "work-1", imageUrl: "https://example.com/cover.jpg", coverCacheDir: "/data/covers" },
      deps,
      db,
    );

    expect(db.updateWork).toHaveBeenCalledWith("work-1", {
      coverPath: "work-1",
      editedFields: ["coverPath"],
      coverColors: undefined,
    });
    expect(result).toEqual({ success: true });
  });

  it("throws when work is not found", async () => {
    db = createMockDb({ findWork: vi.fn().mockResolvedValue(null) });

    await expect(
      applyCoverFromUrl(
        { workId: "work-1", imageUrl: "https://example.com/cover.jpg", coverCacheDir: "/data/covers" },
        deps,
        db,
      ),
    ).rejects.toThrow("Work not found");
  });

  it("merges editedFields without duplicates", async () => {
    db = createMockDb({
      findWork: vi.fn().mockResolvedValue({ editedFields: ["description", "coverPath"] }),
      updateWork: vi.fn().mockResolvedValue(undefined),
    });

    await applyCoverFromUrl(
      { workId: "work-1", imageUrl: "https://example.com/cover.jpg", coverCacheDir: "/data/covers" },
      deps,
      db,
    );

    expect(db.updateWork).toHaveBeenCalledWith("work-1", {
      coverPath: "work-1",
      editedFields: ["description", "coverPath"],
      coverColors: ["#1a2b3c", "#4d5e6f", "#a0b1c2"],
    });
  });

  it("allows missing content-type if magic bytes are valid", async () => {
    deps = createMockDeps({
      fetchUrl: vi.fn().mockResolvedValue({ buffer: VALID_JPEG, contentType: null }),
    });

    const result = await applyCoverFromUrl(
      { workId: "work-1", imageUrl: "https://example.com/cover", coverCacheDir: "/data/covers" },
      deps,
      db,
    );

    expect(result).toEqual({ success: true });
  });
});
