import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile as fsWriteFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import {
  detectAdjacentCover,
  resizeCoverImage,
  processCoverForWork,
  processCoverForWorkDefault,
  type CoverDependencies,
  type ProcessCoverInput,
} from "./covers";

function makeDirent(name: string, isFile: boolean): Dirent {
  return {
    name,
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: "/test",
    path: "/test",
  } as Dirent;
}

describe("detectAdjacentCover", () => {
  it("returns null for empty directory", async () => {
    const listDirectory = vi.fn().mockResolvedValue([]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBeNull();
  });

  it("returns null when no image files exist", async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirent("book.epub", true),
      makeDirent("metadata.opf", true),
    ]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBeNull();
  });

  it("finds cover.jpg file", async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirent("book.epub", true),
      makeDirent("cover.jpg", true),
    ]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBe(path.join("/books/author/title", "cover.jpg"));
  });

  it("prioritizes cover.* over other image files", async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirent("art.png", true),
      makeDirent("cover.webp", true),
      makeDirent("photo.jpg", true),
    ]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBe(path.join("/books/author/title", "cover.webp"));
  });

  it("falls back to first image file when no cover.* exists", async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirent("book.epub", true),
      makeDirent("art.png", true),
      makeDirent("photo.jpg", true),
    ]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBe(path.join("/books/author/title", "art.png"));
  });

  it("is case-insensitive for cover.* matching", async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirent("Cover.JPG", true),
    ]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBe(path.join("/books/author/title", "Cover.JPG"));
  });

  it("skips directories", async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirent("covers", false),
      makeDirent("cover.jpg", true),
    ]);
    const result = await detectAdjacentCover("/books/author/title", listDirectory);
    expect(result).toBe(path.join("/books/author/title", "cover.jpg"));
  });

  it("returns null on listDirectory error", async () => {
    const listDirectory = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await detectAdjacentCover("/books/missing", listDirectory);
    expect(result).toBeNull();
  });
});

describe("resizeCoverImage", () => {
  it("creates output directory and writes thumb and medium webp", async () => {
    const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from("resized"));
    const mockWebp = vi.fn().mockReturnValue({ toBuffer: mockToBuffer });
    const mockResize = vi.fn().mockReturnValue({ webp: mockWebp });
    const mockSharp = vi.fn().mockReturnValue({ resize: mockResize });
    const mockMkdir = vi.fn().mockResolvedValue(undefined);
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    const result = await resizeCoverImage(
      { imageBuffer: Buffer.from("original"), outputDir: "/data/covers/work-123" },
      { sharp: mockSharp as never, mkdir: mockMkdir, writeFile: mockWriteFile },
    );

    expect(mockMkdir).toHaveBeenCalledWith("/data/covers/work-123", { recursive: true });
    expect(mockSharp).toHaveBeenCalledTimes(2);
    expect(mockResize).toHaveBeenCalledWith(200, undefined, { fit: "inside", withoutEnlargement: true });
    expect(mockResize).toHaveBeenCalledWith(400, undefined, { fit: "inside", withoutEnlargement: true });
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      thumbPath: path.join("/data/covers/work-123", "thumb.webp"),
      mediumPath: path.join("/data/covers/work-123", "medium.webp"),
    });
  });
});

describe("processCoverForWork", () => {
  function createMockDeps(overrides: Partial<CoverDependencies> = {}): CoverDependencies {
    return {
      extractEpubCover: vi.fn().mockResolvedValue(null),
      readFile: vi.fn().mockResolvedValue(Buffer.from("image-data")),
      detectAdjacentCover: vi.fn().mockResolvedValue(null),
      resizeCoverImage: vi.fn().mockResolvedValue({
        thumbPath: "/data/covers/work-1/thumb.webp",
        mediumPath: "/data/covers/work-1/medium.webp",
      }),
      db: {
        fileAsset: {
          findUnique: vi.fn().mockResolvedValue({
            id: "fa-1",
            absolutePath: "/books/author/title/book.epub",
            mediaKind: MediaKind.EPUB,
          }),
        },
        work: {
          update: vi.fn().mockResolvedValue({}),
        },
      },
      ...overrides,
    };
  }

  function createInput(overrides: Partial<ProcessCoverInput> = {}): ProcessCoverInput {
    return {
      workId: "work-1",
      fileAssetId: "fa-1",
      coverCacheDir: "/data/covers",
      ...overrides,
    };
  }

  it("extracts cover from EPUB and resizes", async () => {
    const workUpdate = vi.fn().mockResolvedValue({});
    const deps = createMockDeps({
      extractEpubCover: vi.fn().mockResolvedValue({
        buffer: Buffer.from("epub-cover"),
        mediaType: "image/jpeg",
      }),
      db: {
        fileAsset: {
          findUnique: vi.fn().mockResolvedValue({
            id: "fa-1",
            absolutePath: "/books/author/title/book.epub",
            mediaKind: MediaKind.EPUB,
          }),
        },
        work: { update: workUpdate },
      },
    });

    const result = await processCoverForWork(createInput(), deps);

    expect(deps.extractEpubCover).toHaveBeenCalledWith("/books/author/title/book.epub");
    expect(deps.resizeCoverImage).toHaveBeenCalled();
    expect(workUpdate).toHaveBeenCalledWith({
      where: { id: "work-1" },
      data: { coverPath: "work-1" },
    });
    expect(result.source).toBe("epub");
    expect(result.updated).toBe(true);
  });

  it("falls back to adjacent cover when EPUB has none", async () => {
    const workUpdate = vi.fn().mockResolvedValue({});
    const deps = createMockDeps({
      extractEpubCover: vi.fn().mockResolvedValue(null),
      detectAdjacentCover: vi.fn().mockResolvedValue("/books/author/title/cover.jpg"),
      db: {
        fileAsset: {
          findUnique: vi.fn().mockResolvedValue({
            id: "fa-1",
            absolutePath: "/books/author/title/book.epub",
            mediaKind: MediaKind.EPUB,
          }),
        },
        work: { update: workUpdate },
      },
    });

    const result = await processCoverForWork(createInput(), deps);

    expect(deps.extractEpubCover).toHaveBeenCalled();
    expect(deps.detectAdjacentCover).toHaveBeenCalled();
    expect(deps.readFile).toHaveBeenCalledWith("/books/author/title/cover.jpg");
    expect(deps.resizeCoverImage).toHaveBeenCalled();
    expect(workUpdate).toHaveBeenCalled();
    expect(result.source).toBe("adjacent");
    expect(result.updated).toBe(true);
  });

  it("uses adjacent cover for non-EPUB media kinds", async () => {
    const deps = createMockDeps({
      db: {
        fileAsset: {
          findUnique: vi.fn().mockResolvedValue({
            id: "fa-1",
            absolutePath: "/books/author/title/metadata.json",
            mediaKind: MediaKind.SIDECAR,
          }),
        },
        work: {
          update: vi.fn().mockResolvedValue({}),
        },
      },
      detectAdjacentCover: vi.fn().mockResolvedValue("/books/author/title/cover.jpg"),
    });

    const result = await processCoverForWork(createInput(), deps);

    expect(deps.extractEpubCover).not.toHaveBeenCalled();
    expect(deps.detectAdjacentCover).toHaveBeenCalled();
    expect(result.source).toBe("adjacent");
    expect(result.updated).toBe(true);
  });

  it("returns updated=false when no cover found", async () => {
    const workUpdate = vi.fn().mockResolvedValue({});
    const deps = createMockDeps({
      db: {
        fileAsset: {
          findUnique: vi.fn().mockResolvedValue({
            id: "fa-1",
            absolutePath: "/books/author/title/book.epub",
            mediaKind: MediaKind.EPUB,
          }),
        },
        work: { update: workUpdate },
      },
    });

    const result = await processCoverForWork(createInput(), deps);

    expect(deps.resizeCoverImage).not.toHaveBeenCalled();
    expect(workUpdate).not.toHaveBeenCalled();
    expect(result.source).toBe("none");
    expect(result.updated).toBe(false);
  });

  it("throws when file asset is not found", async () => {
    const deps = createMockDeps({
      db: {
        fileAsset: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        work: {
          update: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await expect(processCoverForWork(createInput(), deps)).rejects.toThrow(
      'File asset "fa-1" was not found',
    );
  });
});

describe("processCoverForWorkDefault", () => {
  it("throws when file asset is not found", async () => {
    const db = {
      fileAsset: { findUnique: vi.fn().mockResolvedValue(null) },
      work: { update: vi.fn().mockResolvedValue({}) },
    };
    const handler = processCoverForWorkDefault(db);
    await expect(handler({ workId: "w-1", fileAssetId: "fa-missing", coverCacheDir: "/tmp" })).rejects.toThrow(
      'File asset "fa-missing" was not found',
    );
    expect(db.fileAsset.findUnique).toHaveBeenCalledWith({ where: { id: "fa-missing" } });
  });

  it("calls detectAdjacentCover with real readdir when no embedded cover found", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bookhouse-covers-default-"));
    await fsWriteFile(path.join(dir, "track.mp3"), "audio");
    const db = {
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fa-1",
          absolutePath: path.join(dir, "track.mp3"),
          mediaKind: "AUDIO",
        }),
      },
      work: { update: vi.fn().mockResolvedValue({}) },
    };
    const handler = processCoverForWorkDefault(db);
    const result = await handler({ workId: "w-1", fileAssetId: "fa-1", coverCacheDir: dir });
    // No EPUB, no adjacent cover file → source "none"
    expect(result).toEqual({ source: "none", updated: false });
  });

  it("calls resizeCoverImage with real sharp when adjacent cover is found", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bookhouse-covers-resize-"));
    await fsWriteFile(path.join(dir, "track.mp3"), "audio");
    // Minimal 1x1 red pixel JPEG
    const jpegBytes = Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
      "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
      "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
      "MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQ" +
      "AAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAA" +
      "AAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k=",
      "base64",
    );
    await fsWriteFile(path.join(dir, "cover.jpg"), jpegBytes);
    const db = {
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fa-1",
          absolutePath: path.join(dir, "track.mp3"),
          mediaKind: "AUDIO",
        }),
      },
      work: { update: vi.fn().mockResolvedValue({}) },
    };
    const handler = processCoverForWorkDefault(db);
    const result = await handler({ workId: "w-1", fileAssetId: "fa-1", coverCacheDir: dir });
    expect(result).toEqual({ source: "adjacent", updated: true });
    expect(db.work.update).toHaveBeenCalledWith({ where: { id: "w-1" }, data: { coverPath: "w-1" } });
  });
});
