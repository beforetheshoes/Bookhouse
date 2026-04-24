import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateEditionFile } from "./shared";
import { resolveKoreaderDocument, resolveKoreaderTimestamp } from "./shared";

const { mockHashFileContents } = vi.hoisted(() => ({
  mockHashFileContents: vi.fn(),
}));

vi.mock("@bookhouse/ingest", () => ({
  hashFileContents: mockHashFileContents,
}));

vi.mock("@bookhouse/shared", () => ({
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
      findExactCandidates: async () => [
        makeCandidate(),
        makeCandidate({
          id: "ef-2",
          editionId: "ed-1",
          role: "SIDECAR",
          fileAsset: { id: "fa-2", koreaderHash: "ABCD1234" },
        }),
      ],
      findUnhashedCandidates: async () => [],
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
      findExactCandidates: async () => [
        makeCandidate({
          fileAsset: { koreaderHash: "different-hash" },
        }),
        makeCandidate({
          id: "ef-2",
          role: "SIDECAR",
          fileAsset: { id: "fa-2", koreaderHash: "abcd1234" },
        }),
      ],
      findUnhashedCandidates: async () => [],
      updateFileAssetHash: vi.fn(),
    });

    expect(result).toBeNull();
  });

  it("lazily hashes unhashed candidates and de-duplicates file asset updates", async () => {
    mockHashFileContents.mockResolvedValueOnce({ koreaderHash: "lazy-hash-1" });

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
      findExactCandidates: async () => [],
      findUnhashedCandidates: async () => [
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
      ],
      updateFileAssetHash,
    });

    expect(mockHashFileContents).toHaveBeenCalledTimes(1);
    expect(mockHashFileContents).toHaveBeenCalledWith("/library/book.epub");
    expect(updateFileAssetHash).toHaveBeenCalledTimes(1);
    expect(updateFileAssetHash).toHaveBeenCalledWith("fa-1", "lazy-hash-1");
    expect(result).toEqual({
      document: "lazy-hash-1",
      editionId: "ed-1",
      fileAssetId: "fa-1",
    });
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
