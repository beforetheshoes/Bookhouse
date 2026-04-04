import { describe, it, expect, vi, beforeEach } from "vitest";

const cleanupOrphanedFileAssetsMock = vi.fn();

vi.mock("@bookhouse/ingest", () => ({
  IGNORED_BASENAMES: [".DS_Store", "Thumbs.db", "desktop.ini"],
  cleanupOrphanedFileAssets: cleanupOrphanedFileAssetsMock,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: object) => object | Promise<object>) => (a?: object) => object | Promise<object>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a ?? {}),
    };
    return b;
  },
}));

const workCountMock = vi.fn();
const workFindManyMock = vi.fn();
const workDeleteManyMock = vi.fn();
const duplicateCandidateCountMock = vi.fn();
const fileAssetCountMock = vi.fn();
const fileAssetFindManyMock = vi.fn();
const fileAssetFindUniqueMock = vi.fn();
const fileAssetDeleteMock = vi.fn();
const matchSuggestionCountMock = vi.fn();
const editionFileFindManyMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { count: workCountMock, findMany: workFindManyMock, deleteMany: workDeleteManyMock },
    duplicateCandidate: { count: duplicateCandidateCountMock },
    editionFile: { findMany: editionFileFindManyMock },
    fileAsset: {
      count: fileAssetCountMock,
      findMany: fileAssetFindManyMock,
      findUnique: fileAssetFindUniqueMock,
      delete: fileAssetDeleteMock,
    },
    matchSuggestion: { count: matchSuggestionCountMock },
  },
}));

import {
  getLibraryHealthServerFn,
  getOrphanedFilesServerFn,
  deleteOrphanedFileServerFn,
  getEmptyWorksServerFn,
  deleteEmptyWorksServerFn,
} from "./library-health";

beforeEach(() => {
  workCountMock.mockReset();
  workFindManyMock.mockReset();
  workDeleteManyMock.mockReset();
  duplicateCandidateCountMock.mockReset();
  fileAssetCountMock.mockReset();
  fileAssetFindManyMock.mockReset();
  fileAssetFindUniqueMock.mockReset();
  fileAssetDeleteMock.mockReset();
  matchSuggestionCountMock.mockReset();
  editionFileFindManyMock.mockReset();
  editionFileFindManyMock.mockResolvedValue([]);
  cleanupOrphanedFileAssetsMock.mockReset();
  cleanupOrphanedFileAssetsMock.mockResolvedValue({ deletedFileAssetIds: [] });
});

// ─── getLibraryHealthServerFn ─────────────────────────────────────────────────

describe("getLibraryHealthServerFn", () => {
  function setupMocks(overrides?: {
    totalWorks?: number;
    missingCover?: number;
    noIsbn?: number;
    pendingDuplicates?: number;
    orphanedFiles?: number;
    pendingMatchSuggestions?: number;
    emptyWorks?: number;
  }) {
    const defaults = {
      totalWorks: 100,
      missingCover: 5,
      noIsbn: 10,
      pendingDuplicates: 3,
      orphanedFiles: 2,
      pendingMatchSuggestions: 4,
      emptyWorks: 0,
    };
    const vals = { ...defaults, ...overrides };

    workCountMock
      .mockResolvedValueOnce(vals.totalWorks)
      .mockResolvedValueOnce(vals.missingCover)
      .mockResolvedValueOnce(vals.noIsbn)
      .mockResolvedValueOnce(vals.emptyWorks);

    duplicateCandidateCountMock.mockResolvedValueOnce(vals.pendingDuplicates);
    fileAssetCountMock.mockResolvedValueOnce(vals.orphanedFiles);
    matchSuggestionCountMock.mockResolvedValueOnce(vals.pendingMatchSuggestions);
  }

  it("counts only works with at least one PRESENT file (totalWorks filter)", async () => {
    setupMocks({ totalWorks: 42 });
    const result = await getLibraryHealthServerFn();
    expect(result.totalWorks).toBe(42);
    const call = workCountMock.mock.calls[0] as [{ where: object }];
    expect(call[0]).toEqual({
      where: {
        editions: {
          some: {
            editionFiles: {
              some: { fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } } },
            },
          },
        },
      },
    });
  });

  it("counts works with missing covers (coverPath is null)", async () => {
    setupMocks({ missingCover: 7 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.missingCover).toEqual({ count: 7, total: 100 });

    const missingCoverCall = workCountMock.mock.calls[1] as [{ where: { AND: object[] } }];
    expect(missingCoverCall[0]).toEqual({
      where: {
        AND: [
          { editions: { some: { editionFiles: { some: { fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } } } } } } },
          { coverPath: null },
        ],
      },
    });
  });

  it("counts works where every edition lacks ISBN", async () => {
    setupMocks({ noIsbn: 15 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.noIsbn).toEqual({ count: 15, total: 100 });

    const noIsbnCall = workCountMock.mock.calls[2] as [{ where: { AND: object[] } }];
    expect(noIsbnCall[0]).toEqual({
      where: {
        AND: [
          { editions: { some: { editionFiles: { some: { fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } } } } } } },
          { editions: { every: { isbn13: null, isbn10: null } } },
        ],
      },
    });
  });

  it("counts pending duplicate candidates", async () => {
    setupMocks({ pendingDuplicates: 6 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.pendingDuplicates).toEqual({ count: 6 });
    expect(duplicateCandidateCountMock).toHaveBeenCalledWith({
      where: { status: "PENDING" },
    });
  });

  it("counts orphaned files excluding COVER, SIDECAR, and OS junk files", async () => {
    setupMocks({ orphanedFiles: 3 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.orphanedFiles).toEqual({ count: 3 });
    expect(fileAssetCountMock).toHaveBeenCalledWith({
      where: {
        editionFiles: { none: {} },
        availabilityStatus: "PRESENT",
        mediaKind: { notIn: ["COVER", "SIDECAR"] },
        basename: { notIn: [".DS_Store", "Thumbs.db", "desktop.ini"] },
      },
    });
  });

  it("counts pending match suggestions", async () => {
    setupMocks({ pendingMatchSuggestions: 9 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.pendingMatchSuggestions).toEqual({ count: 9 });
    expect(matchSuggestionCountMock).toHaveBeenCalledWith({
      where: { reviewStatus: "PENDING" },
    });
  });

  it("counts empty works (works with no PRESENT files)", async () => {
    setupMocks({ emptyWorks: 3 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.emptyWorks).toEqual({ count: 3 });
    const call = workCountMock.mock.calls[3] as [{ where: { NOT: object } }];
    expect(call[0]).toEqual({
      where: {
        NOT: {
          editions: {
            some: {
              editionFiles: {
                some: { fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } } },
              },
            },
          },
        },
      },
    });
  });

  it("returns all zero counts when library is empty", async () => {
    setupMocks({
      totalWorks: 0,
      missingCover: 0,
      noIsbn: 0,
      pendingDuplicates: 0,
      orphanedFiles: 0,
      pendingMatchSuggestions: 0,

      emptyWorks: 0,
    });
    const result = await getLibraryHealthServerFn();
    expect(result.totalWorks).toBe(0);
    expect(result.checks.missingCover.count).toBe(0);
    expect(result.checks.noIsbn.count).toBe(0);
    expect(result.checks.pendingDuplicates.count).toBe(0);
    expect(result.checks.orphanedFiles.count).toBe(0);
    expect(result.checks.pendingMatchSuggestions.count).toBe(0);

    expect(result.checks.emptyWorks.count).toBe(0);
  });

  it("runs all queries in parallel via Promise.all", async () => {
    setupMocks();
    await getLibraryHealthServerFn();
    expect(workCountMock).toHaveBeenCalledTimes(4);
    expect(duplicateCandidateCountMock).toHaveBeenCalledTimes(1);
    expect(fileAssetCountMock).toHaveBeenCalledTimes(1);
    expect(matchSuggestionCountMock).toHaveBeenCalledTimes(1);
  });
});

// ─── getOrphanedFilesServerFn ─────────────────────────────────────────────────

describe("getOrphanedFilesServerFn", () => {
  it("queries fileAsset.findMany with correct where/select/orderBy, excluding OS junk files", async () => {
    fileAssetFindManyMock.mockResolvedValue([]);
    await getOrphanedFilesServerFn();
    expect(fileAssetFindManyMock).toHaveBeenCalledWith({
      where: {
        editionFiles: { none: {} },
        availabilityStatus: "PRESENT",
        mediaKind: { notIn: ["COVER", "SIDECAR"] },
        basename: { notIn: [".DS_Store", "Thumbs.db", "desktop.ini"] },
      },
      select: {
        id: true,
        relativePath: true,
        mediaKind: true,
        sizeBytes: true,
      },
      orderBy: { relativePath: "asc" },
    });
  });

  it("returns the list from findMany", async () => {
    const fakeFiles = [
      { id: "f1", relativePath: "books/orphan.epub", mediaKind: "EPUB", sizeBytes: 1024n },
    ];
    fileAssetFindManyMock.mockResolvedValue(fakeFiles);
    const result = await getOrphanedFilesServerFn();
    expect(result).toEqual(fakeFiles);
  });

  it("returns empty array when no orphaned files exist", async () => {
    fileAssetFindManyMock.mockResolvedValue([]);
    const result = await getOrphanedFilesServerFn();
    expect(result).toEqual([]);
  });
});

// ─── deleteOrphanedFileServerFn ───────────────────────────────────────────────

describe("deleteOrphanedFileServerFn", () => {
  it("deletes the file asset and returns success", async () => {
    fileAssetFindUniqueMock.mockResolvedValue({
      id: "f1",
      editionFiles: [],
    });
    fileAssetDeleteMock.mockResolvedValue({ id: "f1" });

    const result = await deleteOrphanedFileServerFn({ data: { fileAssetId: "f1" } });

    expect(fileAssetFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "f1" },
      include: { editionFiles: { take: 1 } },
    });
    expect(fileAssetDeleteMock).toHaveBeenCalledWith({ where: { id: "f1" } });
    expect(result).toEqual({ success: true });
  });

  it("throws when file asset is not found", async () => {
    fileAssetFindUniqueMock.mockResolvedValue(null);
    await expect(
      deleteOrphanedFileServerFn({ data: { fileAssetId: "missing" } }),
    ).rejects.toThrow("File not found");
  });

  it("throws when file asset has linked edition files", async () => {
    fileAssetFindUniqueMock.mockResolvedValue({
      id: "f1",
      editionFiles: [{ id: "ef1" }],
    });
    await expect(
      deleteOrphanedFileServerFn({ data: { fileAssetId: "f1" } }),
    ).rejects.toThrow("File has linked editions");
    expect(fileAssetDeleteMock).not.toHaveBeenCalled();
  });
});

// ─── getEmptyWorksServerFn ────────────────────────────────────────────────────

describe("getEmptyWorksServerFn", () => {
  it("queries work.findMany with NOT hasFilesWhere, selects id+titleDisplay, orders by titleDisplay", async () => {
    workFindManyMock.mockResolvedValue([]);
    await getEmptyWorksServerFn();
    expect(workFindManyMock).toHaveBeenCalledWith({
      where: {
        NOT: {
          editions: {
            some: {
              editionFiles: {
                some: { fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } } },
              },
            },
          },
        },
      },
      select: { id: true, titleDisplay: true },
      orderBy: { titleDisplay: "asc" },
    });
  });

  it("returns the list of empty works from findMany", async () => {
    const fakeWorks = [
      { id: "w1", titleDisplay: "Ghost Book" },
      { id: "w2", titleDisplay: "Phantom Novel" },
    ];
    workFindManyMock.mockResolvedValue(fakeWorks);
    const result = await getEmptyWorksServerFn();
    expect(result).toEqual(fakeWorks);
  });

  it("returns empty array when no empty works exist", async () => {
    workFindManyMock.mockResolvedValue([]);
    const result = await getEmptyWorksServerFn();
    expect(result).toEqual([]);
  });
});

// ─── deleteEmptyWorksServerFn ─────────────────────────────────────────────────

describe("deleteEmptyWorksServerFn", () => {
  it("returns deletedCount: 0 and skips deleteMany when no empty works exist", async () => {
    workFindManyMock.mockResolvedValue([]);
    const result = await deleteEmptyWorksServerFn();
    expect(workDeleteManyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("deletes all empty works, cleans up orphaned FileAssets, and returns deletedCount", async () => {
    workFindManyMock.mockResolvedValue([{ id: "w1" }, { id: "w2" }]);
    editionFileFindManyMock.mockResolvedValue([{ fileAssetId: "fa-1" }]);
    workDeleteManyMock.mockResolvedValue({ count: 2 });
    const result = await deleteEmptyWorksServerFn();
    expect(editionFileFindManyMock).toHaveBeenCalledWith({
      where: { edition: { workId: { in: ["w1", "w2"] } } },
      select: { fileAssetId: true },
    });
    expect(workDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["w1", "w2"] } },
    });
    expect(cleanupOrphanedFileAssetsMock).toHaveBeenCalledWith(expect.anything(), ["fa-1"]);
    expect(result).toEqual({ deletedCount: 2 });
  });
});
