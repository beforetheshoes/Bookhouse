import { describe, it, expect, vi } from "vitest";
import { getKepubCachePath, convertToKepub } from "./kepub";
import type { KepubConvertDeps } from "./kepub";

describe("getKepubCachePath", () => {
  it("returns a path in the cache directory with hash suffix", () => {
    const result = getKepubCachePath("/cache", "/books/my-book.epub");
    expect(result).toMatch(/^\/cache\/my-book-[a-f0-9]{16}\.kepub\.epub$/);
  });

  it("is deterministic for the same input", () => {
    const a = getKepubCachePath("/cache", "/books/test.epub", "hash-1");
    const b = getKepubCachePath("/cache", "/books/test.epub", "hash-1");
    expect(a).toBe(b);
  });

  it("differs for different paths and for different content at the same path", () => {
    const a = getKepubCachePath("/cache", "/books/a.epub");
    const b = getKepubCachePath("/cache", "/books/b.epub");
    expect(a).not.toBe(b);
    // A re-downloaded file at the same path must not hit the stale conversion.
    expect(getKepubCachePath("/cache", "/books/a.epub", "hash-1"))
      .not.toBe(getKepubCachePath("/cache", "/books/a.epub", "hash-2"));
  });
});

describe("convertToKepub", () => {
  function makeDeps(overrides: Partial<KepubConvertDeps> = {}): KepubConvertDeps {
    return {
      execFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      rename: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("returns cached path when file already exists", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(true) });

    const result = await convertToKepub("/books/test.epub", "/cache", deps);

    expect(result).toMatch(/\.kepub\.epub$/);
    expect(deps.execFile).not.toHaveBeenCalled();
  });

  it("converts into a temp file and renames it into the cache slot on a miss", async () => {
    // existsSync: false for the cache check, true for the post-conversion check.
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
    });

    const result = await convertToKepub("/books/test.epub", "/cache", deps, "content-hash");

    expect(deps.mkdirSync).toHaveBeenCalledWith("/cache", { recursive: true });
    const [cmd, args] = (deps.execFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
    expect(cmd).toBe("kepubify");
    expect(args[0]).toBe("-o");
    expect(args[1]).toMatch(new RegExp(`^${result.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[a-f0-9]{12}\\.tmp$`));
    expect(args[2]).toBe("/books/test.epub");
    expect(deps.rename).toHaveBeenCalledWith(args[1], result);
  });

  it("runs one conversion for concurrent requests of the same book", async () => {
    let finish: () => void = () => undefined;
    const execFile = vi.fn(() => new Promise<{ stdout: string; stderr: string }>((resolve) => {
      finish = () => { resolve({ stdout: "", stderr: "" }); };
    }));
    const deps = makeDeps({
      execFile,
      existsSync: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true),
    });

    const first = convertToKepub("/books/same.epub", "/cache", deps);
    const second = convertToKepub("/books/same.epub", "/cache", deps);
    finish();

    await expect(Promise.all([first, second])).resolves.toEqual([await first, await first]);
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it("propagates exec errors", async () => {
    const deps = makeDeps({
      execFile: vi.fn().mockRejectedValue(new Error("kepubify not found")),
    });

    await expect(
      convertToKepub("/books/test.epub", "/cache", deps),
    ).rejects.toThrow("kepubify not found");
  });

  it("throws when kepubify exits cleanly but produces no output file", async () => {
    // execFile resolves but the output never appears on disk (existsSync false
    // for both the cache check and the post-conversion verification).
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(false) });

    await expect(
      convertToKepub("/books/test.epub", "/cache", deps),
    ).rejects.toThrow(/did not produce output/);
    expect(deps.execFile).toHaveBeenCalled();
    expect(deps.rename).not.toHaveBeenCalled();
  });
});
