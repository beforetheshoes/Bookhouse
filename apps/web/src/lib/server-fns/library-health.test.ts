import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@bookhouse/ingest", () => ({
  IGNORED_BASENAMES: [".DS_Store", "Thumbs.db", "desktop.ini"],
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
const duplicateCandidateCountMock = vi.fn();
const fileAssetCountMock = vi.fn();
const fileAssetFindManyMock = vi.fn();
const fileAssetFindUniqueMock = vi.fn();
const fileAssetDeleteMock = vi.fn();
const matchSuggestionCountMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { count: workCountMock },
    duplicateCandidate: { count: duplicateCandidateCountMock },
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
} from "./library-health";

beforeEach(() => {
  workCountMock.mockReset();
  duplicateCandidateCountMock.mockReset();
  fileAssetCountMock.mockReset();
  fileAssetFindManyMock.mockReset();
  fileAssetFindUniqueMock.mockReset();
  fileAssetDeleteMock.mockReset();
  matchSuggestionCountMock.mockReset();
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
    staleEnrichment?: number;
  }) {
    const defaults = {
      totalWorks: 100,
      missingCover: 5,
      noIsbn: 10,
      pendingDuplicates: 3,
      orphanedFiles: 2,
      pendingMatchSuggestions: 4,
      staleEnrichment: 8,
    };
    const vals = { ...defaults, ...overrides };

    workCountMock
      .mockResolvedValueOnce(vals.totalWorks)
      .mockResolvedValueOnce(vals.missingCover)
      .mockResolvedValueOnce(vals.noIsbn)
      .mockResolvedValueOnce(vals.staleEnrichment);

    duplicateCandidateCountMock.mockResolvedValueOnce(vals.pendingDuplicates);
    fileAssetCountMock.mockResolvedValueOnce(vals.orphanedFiles);
    matchSuggestionCountMock.mockResolvedValueOnce(vals.pendingMatchSuggestions);
  }

  it("returns totalWorks count", async () => {
    setupMocks({ totalWorks: 42 });
    const result = await getLibraryHealthServerFn();
    expect(result.totalWorks).toBe(42);
  });

  it("counts works with missing covers (coverPath is null)", async () => {
    setupMocks({ missingCover: 7 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.missingCover).toEqual({ count: 7, total: 100 });

    const missingCoverCall = workCountMock.mock.calls[1] as [{ where: { coverPath: null } }];
    expect(missingCoverCall[0]).toEqual({ where: { coverPath: null } });
  });

  it("counts works where every edition lacks ISBN", async () => {
    setupMocks({ noIsbn: 15 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.noIsbn).toEqual({ count: 15, total: 100 });

    const noIsbnCall = workCountMock.mock.calls[2] as [{ where: object }];
    expect(noIsbnCall[0]).toEqual({
      where: {
        editions: {
          every: { isbn13: null, isbn10: null },
        },
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

  it("counts stale enrichment with 6-month threshold and some+every guard", async () => {
    setupMocks({ staleEnrichment: 12 });
    const result = await getLibraryHealthServerFn();
    expect(result.checks.staleEnrichment).toEqual({ count: 12, total: 100 });

    const staleCall = workCountMock.mock.calls[3] as [{ where: { enrichmentStatus: string; externalLinks: { some: object; every: { lastSyncedAt: { lt: Date } } } } }];
    const where = staleCall[0].where;
    expect(where.enrichmentStatus).toBe("ENRICHED");
    expect(where.externalLinks.some).toEqual({});
    const threshold = where.externalLinks.every.lastSyncedAt.lt;
    expect(threshold).toBeInstanceOf(Date);
    const daysDiff = (Date.now() - threshold.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(179);
    expect(daysDiff).toBeLessThanOrEqual(181);
  });

  it("returns all zero counts when library is empty", async () => {
    setupMocks({
      totalWorks: 0,
      missingCover: 0,
      noIsbn: 0,
      pendingDuplicates: 0,
      orphanedFiles: 0,
      pendingMatchSuggestions: 0,
      staleEnrichment: 0,
    });
    const result = await getLibraryHealthServerFn();
    expect(result.totalWorks).toBe(0);
    expect(result.checks.missingCover.count).toBe(0);
    expect(result.checks.noIsbn.count).toBe(0);
    expect(result.checks.pendingDuplicates.count).toBe(0);
    expect(result.checks.orphanedFiles.count).toBe(0);
    expect(result.checks.pendingMatchSuggestions.count).toBe(0);
    expect(result.checks.staleEnrichment.count).toBe(0);
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

