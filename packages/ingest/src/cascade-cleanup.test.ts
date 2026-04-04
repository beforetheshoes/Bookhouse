import { describe, it, expect, vi, beforeEach } from "vitest";
import { cascadeCleanupOrphans, cleanupOrphanedFileAssets } from "./cascade-cleanup";

const editionFileFindManyMock = vi.fn();
const editionFileDeleteManyMock = vi.fn();
const fileAssetDeleteManyMock = vi.fn();
const duplicateCandidateDeleteManyMock = vi.fn();
const editionFileCountMock = vi.fn();
const editionDeleteManyMock = vi.fn();
const editionFindManyMock = vi.fn();
const editionCountMock = vi.fn();
const workDeleteManyMock = vi.fn();

function createMockDb() {
  return {
    editionFile: {
      findMany: editionFileFindManyMock,
      deleteMany: editionFileDeleteManyMock,
      count: editionFileCountMock,
    },
    fileAsset: {
      deleteMany: fileAssetDeleteManyMock,
    },
    duplicateCandidate: {
      deleteMany: duplicateCandidateDeleteManyMock,
    },
    edition: {
      findMany: editionFindManyMock,
      deleteMany: editionDeleteManyMock,
      count: editionCountMock,
    },
    work: {
      deleteMany: workDeleteManyMock,
    },
  };
}

describe("cascadeCleanupOrphans", () => {
  beforeEach(() => {
    editionFileFindManyMock.mockReset();
    editionFileDeleteManyMock.mockReset();
    editionFileCountMock.mockReset();
    fileAssetDeleteManyMock.mockReset();
    duplicateCandidateDeleteManyMock.mockReset();
    editionFindManyMock.mockReset();
    editionDeleteManyMock.mockReset();
    editionCountMock.mockReset();
    workDeleteManyMock.mockReset();

    editionFileDeleteManyMock.mockResolvedValue({ count: 0 });
    fileAssetDeleteManyMock.mockResolvedValue({ count: 0 });
    duplicateCandidateDeleteManyMock.mockResolvedValue({ count: 0 });
    editionDeleteManyMock.mockResolvedValue({ count: 0 });
    workDeleteManyMock.mockResolvedValue({ count: 0 });
  });

  it("returns zeros and does nothing when given empty fileAssetIds", async () => {
    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: [] });
    expect(result).toEqual({ deletedEditionFileCount: 0, deletedEditionIds: [], deletedWorkIds: [] });
    expect(editionFileDeleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes EditionFiles for given FileAsset IDs and returns count", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
      { id: "ef-2", editionId: "ed-1" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 2 });
    editionFileCountMock.mockResolvedValue(3); // edition still has other files
    editionFindManyMock.mockResolvedValue([]);

    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1", "fa-2"] });

    expect(editionFileFindManyMock).toHaveBeenCalledWith({
      where: { fileAssetId: { in: ["fa-1", "fa-2"] } },
      select: { id: true, editionId: true },
    });
    expect(editionFileDeleteManyMock).toHaveBeenCalledWith({
      where: { fileAssetId: { in: ["fa-1", "fa-2"] } },
    });
    expect(result.deletedEditionFileCount).toBe(2);
  });

  it("deletes FileAssets and their DuplicateCandidates", async () => {
    editionFileFindManyMock.mockResolvedValue([]);
    editionFindManyMock.mockResolvedValue([]);

    await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1"] });

    expect(duplicateCandidateDeleteManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { leftFileAssetId: { in: ["fa-1"] } },
          { rightFileAssetId: { in: ["fa-1"] } },
        ],
      },
    });
    expect(fileAssetDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["fa-1"] } },
    });
  });

  it("deletes Editions that have zero remaining EditionFiles", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 1 });
    // After deleting ef-1, edition ed-1 has 0 remaining
    editionFileCountMock.mockResolvedValue(0);
    editionFindManyMock.mockResolvedValue([{ id: "ed-1", workId: "w-1" }]);
    editionDeleteManyMock.mockResolvedValue({ count: 1 });
    // After deleting ed-1, work w-1 has 0 remaining editions
    editionCountMock.mockResolvedValue(0);
    workDeleteManyMock.mockResolvedValue({ count: 1 });

    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1"] });

    expect(editionFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["ed-1"] } },
      select: { id: true, workId: true },
    });
    expect(editionDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["ed-1"] } },
    });
    expect(result.deletedEditionIds).toEqual(["ed-1"]);
  });

  it("keeps Editions that still have other EditionFiles", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 1 });
    // ed-1 still has 2 remaining files after this deletion
    editionFileCountMock.mockResolvedValue(2);
    editionFindManyMock.mockResolvedValue([]);

    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1"] });

    expect(editionDeleteManyMock).not.toHaveBeenCalled();
    expect(result.deletedEditionIds).toEqual([]);
  });

  it("deletes Works that have zero remaining Editions", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 1 });
    editionFileCountMock.mockResolvedValue(0);
    editionFindManyMock.mockResolvedValue([{ id: "ed-1", workId: "w-1" }]);
    editionDeleteManyMock.mockResolvedValue({ count: 1 });
    editionCountMock.mockResolvedValue(0);
    workDeleteManyMock.mockResolvedValue({ count: 1 });

    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1"] });

    expect(workDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["w-1"] } },
    });
    expect(result.deletedWorkIds).toEqual(["w-1"]);
  });

  it("keeps Works that still have other Editions", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 1 });
    editionFileCountMock.mockResolvedValue(0);
    editionFindManyMock.mockResolvedValue([{ id: "ed-1", workId: "w-1" }]);
    editionDeleteManyMock.mockResolvedValue({ count: 1 });
    // w-1 still has 2 remaining editions
    editionCountMock.mockResolvedValue(2);

    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1"] });

    expect(workDeleteManyMock).not.toHaveBeenCalled();
    expect(result.deletedWorkIds).toEqual([]);
  });

  it("cleans up DuplicateCandidates referencing deleted Editions", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 1 });
    editionFileCountMock.mockResolvedValue(0);
    editionFindManyMock.mockResolvedValue([{ id: "ed-1", workId: "w-1" }]);
    editionDeleteManyMock.mockResolvedValue({ count: 1 });
    editionCountMock.mockResolvedValue(0);
    workDeleteManyMock.mockResolvedValue({ count: 1 });

    await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1"] });

    // Should have two duplicateCandidate.deleteMany calls:
    // 1st for FileAssets, 2nd for Editions
    expect(duplicateCandidateDeleteManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { leftEditionId: { in: ["ed-1"] } },
          { rightEditionId: { in: ["ed-1"] } },
        ],
      },
    });
  });

  it("handles multiple Editions across different Works correctly", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { id: "ef-1", editionId: "ed-1" },
      { id: "ef-2", editionId: "ed-2" },
      { id: "ef-3", editionId: "ed-3" },
    ]);
    editionFileDeleteManyMock.mockResolvedValue({ count: 3 });
    // ed-1: empty, ed-2: still has files, ed-3: empty
    editionFileCountMock
      .mockResolvedValueOnce(0)   // ed-1
      .mockResolvedValueOnce(1)   // ed-2 still has files
      .mockResolvedValueOnce(0);  // ed-3
    editionFindManyMock.mockResolvedValue([
      { id: "ed-1", workId: "w-1" },
      { id: "ed-3", workId: "w-2" },
    ]);
    editionDeleteManyMock.mockResolvedValue({ count: 2 });
    // w-1: still has editions (ed-2 survived), w-2: empty
    editionCountMock
      .mockResolvedValueOnce(1)   // w-1 still has ed-2
      .mockResolvedValueOnce(0);  // w-2 empty
    workDeleteManyMock.mockResolvedValue({ count: 1 });

    const result = await cascadeCleanupOrphans(createMockDb() as never, { fileAssetIds: ["fa-1", "fa-2", "fa-3"] });

    expect(result.deletedEditionIds).toEqual(["ed-1", "ed-3"]);
    expect(result.deletedWorkIds).toEqual(["w-2"]);
  });
});

describe("cleanupOrphanedFileAssets", () => {
  const fileAssetFindManyMock = vi.fn();
  const fileAssetDeleteManyMock2 = vi.fn();

  function createOrphanDb() {
    return {
      fileAsset: {
        findMany: fileAssetFindManyMock,
        deleteMany: fileAssetDeleteManyMock2,
      },
    };
  }

  beforeEach(() => {
    fileAssetFindManyMock.mockReset();
    fileAssetDeleteManyMock2.mockReset();
    fileAssetDeleteManyMock2.mockResolvedValue({ count: 0 });
  });

  it("returns empty array for empty input", async () => {
    const result = await cleanupOrphanedFileAssets(createOrphanDb() as never, []);
    expect(result).toEqual({ deletedFileAssetIds: [] });
    expect(fileAssetFindManyMock).not.toHaveBeenCalled();
  });

  it("deletes FileAssets with zero EditionFile links", async () => {
    fileAssetFindManyMock.mockResolvedValue([{ id: "fa-1" }, { id: "fa-2" }]);
    fileAssetDeleteManyMock2.mockResolvedValue({ count: 2 });

    const result = await cleanupOrphanedFileAssets(createOrphanDb() as never, ["fa-1", "fa-2", "fa-3"]);

    expect(fileAssetFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["fa-1", "fa-2", "fa-3"] }, editionFiles: { none: {} } },
      select: { id: true },
    });
    expect(fileAssetDeleteManyMock2).toHaveBeenCalledWith({
      where: { id: { in: ["fa-1", "fa-2"] } },
    });
    expect(result).toEqual({ deletedFileAssetIds: ["fa-1", "fa-2"] });
  });

  it("preserves FileAssets that still have EditionFile links", async () => {
    fileAssetFindManyMock.mockResolvedValue([]); // none are orphaned

    const result = await cleanupOrphanedFileAssets(createOrphanDb() as never, ["fa-1"]);

    expect(fileAssetDeleteManyMock2).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedFileAssetIds: [] });
  });
});
