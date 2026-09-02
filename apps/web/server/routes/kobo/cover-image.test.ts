import { describe, it, expect, vi } from "vitest";
import {
  koboCoverFilePath,
  loadKoboCoverJpeg,
  resolveKoboCoverRef,
  type KoboCoverImageDeps,
  type KoboCoverRefLookup,
} from "./cover-image";

const cuid = "c" + "a".repeat(24);
const otherCuid = "c" + "b".repeat(24);
const legacyUuid = "0123abcd-4567-89ab-cdef-0123456789ab";

function makeLookup(overrides: Partial<KoboCoverRefLookup> = {}): KoboCoverRefLookup {
  return {
    findCoverRefByEditionId: vi.fn().mockResolvedValue("ref-1"),
    findAllEditionCoverRefs: vi.fn().mockResolvedValue([]),
    toKoboId: vi.fn((id: string) => `uuid-for-${id}`),
    ...overrides,
  };
}

describe("resolveKoboCoverRef", () => {
  it("resolves a bare edition id directly", async () => {
    const lookup = makeLookup();
    await expect(resolveKoboCoverRef(lookup, cuid)).resolves.toEqual({
      editionId: cuid,
      coverRef: "ref-1",
    });
    expect(lookup.findCoverRefByEditionId).toHaveBeenCalledWith(cuid);
    expect(lookup.findAllEditionCoverRefs).not.toHaveBeenCalled();
  });

  it("strips a -vN version suffix before looking the edition up", async () => {
    const lookup = makeLookup();
    await expect(resolveKoboCoverRef(lookup, `${cuid}-v3`)).resolves.toEqual({
      editionId: cuid,
      coverRef: "ref-1",
    });
    expect(lookup.findCoverRefByEditionId).toHaveBeenCalledWith(cuid);
  });

  it("returns a null coverRef when the edition has no cover", async () => {
    const lookup = makeLookup({ findCoverRefByEditionId: vi.fn().mockResolvedValue(null) });
    await expect(resolveKoboCoverRef(lookup, cuid)).resolves.toEqual({
      editionId: cuid,
      coverRef: null,
    });
  });

  it("resolves a legacy UUID by matching the derived Kobo id across editions", async () => {
    const lookup = makeLookup({
      findAllEditionCoverRefs: vi.fn().mockResolvedValue([
        { id: otherCuid, coverRef: "ref-other" },
        { id: cuid, coverRef: "ref-1" },
      ]),
      toKoboId: vi.fn((id: string) => (id === cuid ? legacyUuid : "no-match")),
    });
    await expect(resolveKoboCoverRef(lookup, legacyUuid)).resolves.toEqual({
      editionId: cuid,
      coverRef: "ref-1",
    });
    expect(lookup.findCoverRefByEditionId).not.toHaveBeenCalled();
  });

  it("returns null for a legacy UUID no edition hashes to", async () => {
    const lookup = makeLookup({
      findAllEditionCoverRefs: vi.fn().mockResolvedValue([{ id: cuid, coverRef: "ref-1" }]),
    });
    await expect(resolveKoboCoverRef(lookup, legacyUuid)).resolves.toBeNull();
  });

  it("returns null for ids that are neither an edition id nor a legacy UUID", async () => {
    const lookup = makeLookup();
    await expect(resolveKoboCoverRef(lookup, "kobo-store-image")).resolves.toBeNull();
    expect(lookup.findCoverRefByEditionId).not.toHaveBeenCalled();
    expect(lookup.findAllEditionCoverRefs).not.toHaveBeenCalled();
  });
});

describe("koboCoverFilePath", () => {
  it("points at the medium WebP inside the cover cache", () => {
    expect(koboCoverFilePath("/data/covers", "ref-1")).toBe("/data/covers/ref-1/medium.webp");
  });
});

describe("loadKoboCoverJpeg", () => {
  function makeDeps(overrides: Partial<KoboCoverImageDeps> = {}): KoboCoverImageDeps {
    return {
      coverCacheDir: "/data/covers",
      existsSync: vi.fn().mockReturnValue(true),
      readFile: vi.fn().mockResolvedValue(Buffer.from("webp")),
      convertToJpeg: vi.fn().mockResolvedValue(Buffer.from("jpeg")),
      ...overrides,
    };
  }

  it("reads the medium WebP and transcodes it to JPEG", async () => {
    const deps = makeDeps();
    const result = await loadKoboCoverJpeg(deps, "ref-1");
    expect(result).toEqual({
      filePath: "/data/covers/ref-1/medium.webp",
      jpeg: Buffer.from("jpeg"),
    });
    expect(deps.readFile).toHaveBeenCalledWith("/data/covers/ref-1/medium.webp");
    expect(deps.convertToJpeg).toHaveBeenCalledWith(Buffer.from("webp"));
  });

  it("returns null without reading when the cache has no file", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(false) });
    await expect(loadKoboCoverJpeg(deps, "ref-1")).resolves.toBeNull();
    expect(deps.readFile).not.toHaveBeenCalled();
  });
});
