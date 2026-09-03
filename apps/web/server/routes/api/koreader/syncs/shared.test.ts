import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateEditionFile } from "./shared";
import { resolveKoreaderDocument, resolveKoreaderTimestamp } from "./shared";

const { mockHashKoreaderDocument, mockWarn } = vi.hoisted(() => ({
  mockHashKoreaderDocument: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock("@bookhouse/ingest", () => ({
  hashKoreaderDocument: mockHashKoreaderDocument,
}));

vi.mock("@bookhouse/shared", () => ({
  createLogger: () => ({ warn: mockWarn }),
  selectPreferredKoboDeliveryFile: (
    files: Array<{ id: string; role: string }>,
  ) => files.find((file) => file.role === "DELIVERY") ?? files[0] ?? null,
}));

function makeCandidate(
  overrides: Partial<Omit<CandidateEditionFile, "fileAsset">> & {
    fileAsset?: Partial<CandidateEditionFile["fileAsset"]>;
  } = {},
): CandidateEditionFile {
  const { fileAsset: fileAssetOverrides, ...candidateOverrides } = overrides;
  const fileAsset = {
    id: "fa-1",
    absolutePath: "/library/book.epub",
    availabilityStatus: "PRESENT",
    basename: "book.epub",
    mediaKind: "EPUB",
    koreaderHash: "abcd1234",
    ...fileAssetOverrides,
  };

  return {
    id: "ef-1",
    editionId: "ed-1",
    role: "DELIVERY",
    ...candidateOverrides,
    fileAsset,
  };
}

describe("resolveKoreaderDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the preferred exact match", async () => {
    const result = await resolveKoreaderDocument({
      document: "ABCD1234",
      findExactCandidates: () => Promise.resolve([
        makeCandidate(),
        makeCandidate({
          id: "ef-2",
          editionId: "ed-1",
          role: "SIDECAR",
          fileAsset: { id: "fa-2", koreaderHash: "ABCD1234" },
        }),
      ]),
      findUnhashedCandidates: () => Promise.resolve([]),
      updateFileAssetHash: vi.fn(),
    });

    expect(result).toEqual({
      document: "ABCD1234",
      editionId: "ed-1",
      fileAssetId: "fa-1",
    });
  });

  it("does not match when only a non-preferred file has the hash", async () => {
    const result = await resolveKoreaderDocument({
      document: "abcd1234",
      findExactCandidates: () => Promise.resolve([
        makeCandidate({
          fileAsset: { koreaderHash: "different-hash" },
        }),
        makeCandidate({
          id: "ef-2",
          role: "SIDECAR",
          fileAsset: { id: "fa-2", koreaderHash: "abcd1234" },
        }),
      ]),
      findUnhashedCandidates: () => Promise.resolve([]),
      updateFileAssetHash: vi.fn(),
    });

    expect(result).toBeNull();
  });

  it("lazily hashes unhashed candidates and de-duplicates file asset updates", async () => {
    mockHashKoreaderDocument.mockResolvedValueOnce("lazy-hash-1");

    const updateFileAssetHash = vi.fn();
    const sharedFileAsset = {
      id: "fa-1",
      absolutePath: "/library/book.epub",
      availabilityStatus: "PRESENT",
      basename: "book.epub",
      mediaKind: "EPUB",
      koreaderHash: null,
    };

    const result = await resolveKoreaderDocument({
      document: "lazy-hash-1",
      findExactCandidates: () => Promise.resolve([]),
      findUnhashedCandidates: () => Promise.resolve([
        {
          id: "ef-1",
          editionId: "ed-1",
          role: "DELIVERY",
          fileAsset: sharedFileAsset,
        },
        {
          id: "ef-2",
          editionId: "ed-1",
          role: "SIDECAR",
          fileAsset: sharedFileAsset,
        },
      ]),
      updateFileAssetHash,
    });

    expect(mockHashKoreaderDocument).toHaveBeenCalledTimes(1);
    expect(mockHashKoreaderDocument).toHaveBeenCalledWith("/library/book.epub");
    expect(updateFileAssetHash).toHaveBeenCalledTimes(1);
    expect(updateFileAssetHash).toHaveBeenCalledWith("fa-1", "lazy-hash-1");
    expect(result).toEqual({
      document: "lazy-hash-1",
      editionId: "ed-1",
      fileAssetId: "fa-1",
    });
  });

  it("skips a candidate whose file cannot be hashed instead of failing the request", async () => {
    mockHashKoreaderDocument
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockResolvedValueOnce("lazy-hash-2");
    const updateFileAssetHash = vi.fn();

    const result = await resolveKoreaderDocument({
      document: "lazy-hash-2",
      findExactCandidates: () => Promise.resolve([]),
      findUnhashedCandidates: () => Promise.resolve([
        makeCandidate({
          id: "ef-gone",
          editionId: "ed-gone",
          fileAsset: { id: "fa-gone", absolutePath: "/library/gone.epub", koreaderHash: null },
        }),
        makeCandidate({
          id: "ef-2",
          editionId: "ed-2",
          fileAsset: { id: "fa-2", absolutePath: "/library/other.epub", koreaderHash: null },
        }),
      ]),
      updateFileAssetHash,
    });

    expect(updateFileAssetHash).toHaveBeenCalledTimes(1);
    expect(updateFileAssetHash).toHaveBeenCalledWith("fa-2", "lazy-hash-2");
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ fileAssetId: "fa-gone", absolutePath: "/library/gone.epub" }),
      "Could not compute KOReader document hash",
    );
    expect(result).toEqual({ document: "lazy-hash-2", editionId: "ed-2", fileAssetId: "fa-2" });
  });
});

describe("resolveKoreaderTimestamp", () => {
  it("falls back when the timestamp is missing or invalid", () => {
    const fallback = new Date("2024-07-01T12:00:00.000Z");

    expect(resolveKoreaderTimestamp(undefined, fallback)).toBe(fallback);
    expect(resolveKoreaderTimestamp(Number.NaN, fallback)).toBe(fallback);
  });

  it("converts epoch seconds into a Date", () => {
    expect(resolveKoreaderTimestamp(1719835200, new Date("2020-01-01T00:00:00.000Z"))).toEqual(
      new Date("2024-07-01T12:00:00.000Z"),
    );
  });
});
