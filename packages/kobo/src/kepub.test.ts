import { describe, it, expect, vi } from "vitest";
import { getKepubCachePath, convertToKepub } from "./kepub";
import type { KepubConvertDeps } from "./kepub";

describe("getKepubCachePath", () => {
  it("returns a path in the cache directory with hash suffix", () => {
    const result = getKepubCachePath("/cache", "/books/my-book.epub");
    expect(result).toMatch(/^\/cache\/my-book-[a-f0-9]{16}\.kepub\.epub$/);
  });

  it("is deterministic for the same input", () => {
    const a = getKepubCachePath("/cache", "/books/test.epub");
    const b = getKepubCachePath("/cache", "/books/test.epub");
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = getKepubCachePath("/cache", "/books/a.epub");
    const b = getKepubCachePath("/cache", "/books/b.epub");
    expect(a).not.toBe(b);
  });
});

describe("convertToKepub", () => {
  function makeDeps(overrides: Partial<KepubConvertDeps> = {}): KepubConvertDeps {
    return {
      execFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      ...overrides,
    };
  }

  it("returns cached path when file already exists", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(true) });

    const result = await convertToKepub("/books/test.epub", "/cache", deps);

    expect(result).toMatch(/\.kepub\.epub$/);
    expect(deps.execFile).not.toHaveBeenCalled();
  });

  it("calls kepubify when cache miss", async () => {
    const deps = makeDeps();

    const result = await convertToKepub("/books/test.epub", "/cache", deps);

    expect(deps.mkdirSync).toHaveBeenCalledWith("/cache", { recursive: true });
    expect(deps.execFile).toHaveBeenCalledWith("kepubify", [
      "-o",
      result,
      "/books/test.epub",
    ]);
  });

  it("propagates exec errors", async () => {
    const deps = makeDeps({
      execFile: vi.fn().mockRejectedValue(new Error("kepubify not found")),
    });

    await expect(
      convertToKepub("/books/test.epub", "/cache", deps),
    ).rejects.toThrow("kepubify not found");
  });
});
