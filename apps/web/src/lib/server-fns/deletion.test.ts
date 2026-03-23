import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: unknown) => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const workDeleteMock = vi.fn();
const editionFindUniqueMock = vi.fn();
const editionDeleteMock = vi.fn();
const editionCountMock = vi.fn();
const workDeleteManyMock = vi.fn();
const editionFindManyMock = vi.fn();
const editionDeleteManyMock = vi.fn();
const fileAssetFindManyMock = vi.fn();
const fileAssetCountMock = vi.fn();
const transactionMock = vi.fn();

const cascadeCleanupOrphansMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: {
      delete: workDeleteMock,
      deleteMany: workDeleteManyMock,
    },
    edition: {
      findUnique: editionFindUniqueMock,
      findMany: editionFindManyMock,
      delete: editionDeleteMock,
      deleteMany: editionDeleteManyMock,
      count: editionCountMock,
    },
    fileAsset: {
      findMany: fileAssetFindManyMock,
      count: fileAssetCountMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@bookhouse/ingest", () => ({
  cascadeCleanupOrphans: cascadeCleanupOrphansMock,
}));

import {
  deleteWorkServerFn,
  deleteEditionServerFn,
  bulkDeleteWorksServerFn,
  bulkDeleteEditionsServerFn,
  getMissingFilesServerFn,
  cleanupMissingFilesServerFn,
} from "./deletion";

beforeEach(() => {
  workDeleteMock.mockReset();
  editionFindUniqueMock.mockReset();
  editionDeleteMock.mockReset();
  editionCountMock.mockReset();
  workDeleteManyMock.mockReset();
  editionFindManyMock.mockReset();
  editionDeleteManyMock.mockReset();
  fileAssetFindManyMock.mockReset();
  fileAssetCountMock.mockReset();
  transactionMock.mockReset();
  cascadeCleanupOrphansMock.mockReset();
  cascadeCleanupOrphansMock.mockResolvedValue({ deletedEditionFileCount: 0, deletedEditionIds: [], deletedWorkIds: [] });
});

describe("deleteWorkServerFn", () => {
  it("deletes the Work by ID and returns the deleted ID", async () => {
    workDeleteMock.mockResolvedValue({ id: "w-1" });

    const result = await deleteWorkServerFn({ data: { workId: "w-1" } });

    expect(workDeleteMock).toHaveBeenCalledWith({ where: { id: "w-1" } });
    expect(result).toEqual({ deletedWorkId: "w-1" });
  });
});

describe("deleteEditionServerFn", () => {
  it("deletes the Edition and returns null deletedWorkId when parent Work still has editions", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "ed-1", workId: "w-1" });
    editionDeleteMock.mockResolvedValue({ id: "ed-1" });
    editionCountMock.mockResolvedValue(2); // still has other editions

    const result = await deleteEditionServerFn({ data: { editionId: "ed-1" } });

    expect(editionDeleteMock).toHaveBeenCalledWith({ where: { id: "ed-1" } });
    expect(workDeleteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedEditionId: "ed-1", deletedWorkId: null });
  });

  it("deletes the Edition and the parent Work when no editions remain", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "ed-1", workId: "w-1" });
    editionDeleteMock.mockResolvedValue({ id: "ed-1" });
    editionCountMock.mockResolvedValue(0); // no editions left

    const result = await deleteEditionServerFn({ data: { editionId: "ed-1" } });

    expect(editionDeleteMock).toHaveBeenCalledWith({ where: { id: "ed-1" } });
    expect(workDeleteMock).toHaveBeenCalledWith({ where: { id: "w-1" } });
    expect(result).toEqual({ deletedEditionId: "ed-1", deletedWorkId: "w-1" });
  });

  it("throws when edition not found", async () => {
    editionFindUniqueMock.mockResolvedValue(null);

    await expect(
      deleteEditionServerFn({ data: { editionId: "missing" } }),
    ).rejects.toThrow("Edition not found");
  });
});

describe("bulkDeleteWorksServerFn", () => {
  it("deletes multiple Works and returns their IDs", async () => {
    workDeleteManyMock.mockResolvedValue({ count: 3 });

    const result = await bulkDeleteWorksServerFn({ data: { workIds: ["w-1", "w-2", "w-3"] } });

    expect(workDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ["w-1", "w-2", "w-3"] } } });
    expect(result).toEqual({ deletedWorkIds: ["w-1", "w-2", "w-3"] });
  });

  it("returns empty array when given empty input", async () => {
    const result = await bulkDeleteWorksServerFn({ data: { workIds: [] } });

    expect(workDeleteManyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedWorkIds: [] });
  });
});

describe("bulkDeleteEditionsServerFn", () => {
  it("deletes Editions and cascade-deletes empty parent Works", async () => {
    editionFindManyMock.mockResolvedValue([
      { id: "ed-1", workId: "w-1" },
      { id: "ed-2", workId: "w-2" },
    ]);
    editionDeleteManyMock.mockResolvedValue({ count: 2 });
    // w-1 still has editions, w-2 is empty
    editionCountMock
      .mockResolvedValueOnce(1) // w-1
      .mockResolvedValueOnce(0); // w-2
    workDeleteManyMock.mockResolvedValue({ count: 1 });

    const result = await bulkDeleteEditionsServerFn({ data: { editionIds: ["ed-1", "ed-2"] } });

    expect(editionDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ["ed-1", "ed-2"] } } });
    expect(workDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ["w-2"] } } });
    expect(result).toEqual({ deletedEditionIds: ["ed-1", "ed-2"], deletedWorkIds: ["w-2"] });
  });

  it("returns empty arrays when given empty input", async () => {
    const result = await bulkDeleteEditionsServerFn({ data: { editionIds: [] } });

    expect(editionDeleteManyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedEditionIds: [], deletedWorkIds: [] });
  });
});

describe("getMissingFilesServerFn", () => {
  it("returns paginated missing files with Work/Edition context", async () => {
    const fakeFiles = [
      {
        id: "fa-1",
        relativePath: "books/gone.epub",
        mediaKind: "EPUB",
        lastSeenAt: new Date("2025-01-01"),
        editionFiles: [{ edition: { id: "ed-1", formatFamily: "EBOOK", work: { id: "w-1", titleDisplay: "Gone Book" } } }],
      },
    ];
    fileAssetFindManyMock.mockResolvedValue(fakeFiles);
    fileAssetCountMock.mockResolvedValue(1);

    const result = await getMissingFilesServerFn({ data: { page: 1, pageSize: 20 } });

    expect(fileAssetFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { availabilityStatus: "MISSING" },
      skip: 0,
      take: 20,
    }));
    expect(result).toEqual({ items: fakeFiles, total: 1 });
  });
});

describe("cleanupMissingFilesServerFn", () => {
  it("calls cascadeCleanupOrphans for MISSING files and returns result", async () => {
    fileAssetCountMock.mockResolvedValue(2); // all 2 are MISSING

    const result = await cleanupMissingFilesServerFn({ data: { fileAssetIds: ["fa-1", "fa-2"] } });

    expect(fileAssetCountMock).toHaveBeenCalledWith({
      where: { id: { in: ["fa-1", "fa-2"] }, availabilityStatus: "MISSING" },
    });
    expect(cascadeCleanupOrphansMock).toHaveBeenCalledWith(
      expect.anything(),
      { fileAssetIds: ["fa-1", "fa-2"] },
    );
    expect(result).toEqual({ deletedEditionFileCount: 0, deletedEditionIds: [], deletedWorkIds: [] });
  });

  it("throws when some files are not MISSING", async () => {
    fileAssetCountMock.mockResolvedValue(1); // only 1 of 2 is MISSING

    await expect(
      cleanupMissingFilesServerFn({ data: { fileAssetIds: ["fa-1", "fa-2"] } }),
    ).rejects.toThrow("Not all specified files have MISSING status");
  });
});
