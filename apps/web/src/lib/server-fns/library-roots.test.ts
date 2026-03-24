import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const libraryRootFindManyMock = vi.fn();
const libraryRootCreateMock = vi.fn();
const libraryRootDeleteMock = vi.fn();
const editionFileDeleteManyMock = vi.fn();
const fileAssetDeleteManyMock = vi.fn();
const fileAssetFindManyMock = vi.fn();
const fileAssetCountMock = vi.fn();
const importJobCreateMock = vi.fn();
const importJobUpdateMock = vi.fn();
const importJobUpdateManyMock = vi.fn();
const importJobDeleteManyMock = vi.fn();
const importJobFindManyMock = vi.fn();
const transactionMock = vi.fn(async (fnOrOps: unknown) => {
  if (typeof fnOrOps === "function") {
    return (fnOrOps as (tx: unknown) => Promise<unknown>)(null);
  }
  return Promise.all(fnOrOps as Promise<unknown>[]);
});

vi.mock("@bookhouse/db", () => ({
  db: {
    libraryRoot: {
      findMany: libraryRootFindManyMock,
      create: libraryRootCreateMock,
      delete: libraryRootDeleteMock,
    },
    editionFile: { deleteMany: editionFileDeleteManyMock },
    fileAsset: {
      deleteMany: fileAssetDeleteManyMock,
      findMany: fileAssetFindManyMock,
      count: fileAssetCountMock,
    },
    importJob: {
      create: importJobCreateMock,
      update: importJobUpdateMock,
      updateMany: importJobUpdateManyMock,
      deleteMany: importJobDeleteManyMock,
      findMany: importJobFindManyMock,
    },
    $transaction: transactionMock,
  },
}));

const enqueueLibraryJobMock = vi.fn();
const getLibraryJobSnapshotMock = vi.fn();
const getImportJobLiveActivityMock = vi.fn();
const LIBRARY_JOB_NAMES = {
  SCAN_LIBRARY_ROOT: "SCAN_LIBRARY_ROOT",
  PARSE_FILE_ASSET_METADATA: "PARSE_FILE_ASSET_METADATA",
};

vi.mock("@bookhouse/shared", () => ({
  enqueueLibraryJob: enqueueLibraryJobMock,
  getImportJobLiveActivity: getImportJobLiveActivityMock,
  getLibraryJobSnapshot: getLibraryJobSnapshotMock,
  LIBRARY_JOB_NAMES,
}));

const parseFileAssetMetadataMock = vi.fn();
const createIngestServicesMock = vi.fn(() => ({
  parseFileAssetMetadata: parseFileAssetMetadataMock,
}));

const cascadeCleanupOrphansMock = vi.fn();

vi.mock("@bookhouse/ingest", () => ({
  createIngestServices: createIngestServicesMock,
  cascadeCleanupOrphans: cascadeCleanupOrphansMock,
}));

import {
  getLibraryRootsServerFn,
  addLibraryRootServerFn,
  removeLibraryRootServerFn,
  scanLibraryRootServerFn,
  getScanProgressServerFn,
  getLibraryIssueCountServerFn,
  getLibraryIssuesServerFn,
  retryLibraryIssuesServerFn,
} from "./library-roots";

describe("getLibraryRootsServerFn", () => {
  beforeEach(() => {
    libraryRootFindManyMock.mockReset();
  });

  it("calls db.libraryRoot.findMany with correct select and orderBy", async () => {
    libraryRootFindManyMock.mockResolvedValue([]);
    await getLibraryRootsServerFn();
    expect(libraryRootFindManyMock).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        path: true,
        kind: true,
        scanMode: true,
        isEnabled: true,
        lastScannedAt: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  });

  it("returns what findMany returns", async () => {
    const fakeRoots = [{ id: "root-1", name: "My Library" }];
    libraryRootFindManyMock.mockResolvedValue(fakeRoots);
    const result = await getLibraryRootsServerFn();
    expect(result).toBe(fakeRoots);
  });
});

describe("addLibraryRootServerFn", () => {
  beforeEach(() => {
    libraryRootCreateMock.mockReset();
  });

  it("calls db.libraryRoot.create with name, path, kind, scanMode and returns result", async () => {
    const fakeRoot = {
      id: "root-new",
      name: "Books",
      path: "/books",
      kind: "EBOOKS",
      scanMode: "INCREMENTAL",
    };
    libraryRootCreateMock.mockResolvedValue(fakeRoot);

    const result = await addLibraryRootServerFn({
      data: {
        name: "Books",
        path: "/books",
        kind: "EBOOKS",
        scanMode: "INCREMENTAL",
      },
    });

    expect(libraryRootCreateMock).toHaveBeenCalledWith({
      data: {
        name: "Books",
        path: "/books",
        kind: "EBOOKS",
        scanMode: "INCREMENTAL",
      },
    });
    expect(result).toBe(fakeRoot);
  });
});

describe("removeLibraryRootServerFn", () => {
  beforeEach(() => {
    transactionMock.mockReset();
    fileAssetFindManyMock.mockReset();
    cascadeCleanupOrphansMock.mockReset();
    importJobDeleteManyMock.mockReset();
    libraryRootDeleteMock.mockReset();
    const txClient = {
      fileAsset: { findMany: fileAssetFindManyMock },
      importJob: { deleteMany: importJobDeleteManyMock },
      libraryRoot: { delete: libraryRootDeleteMock },
    };
    transactionMock.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        return (fn as (tx: unknown) => Promise<unknown>)(txClient);
      }
      return Promise.all(fn as Promise<unknown>[]);
    });
    fileAssetFindManyMock.mockResolvedValue([]);
    cascadeCleanupOrphansMock.mockResolvedValue({ deletedEditionFileCount: 0, deletedEditionIds: [], deletedWorkIds: [] });
    importJobDeleteManyMock.mockResolvedValue({ count: 0 });
    libraryRootDeleteMock.mockResolvedValue({ id: "root-1" });
  });

  it("finds FileAsset IDs, calls cascadeCleanupOrphans, and deletes ImportJobs and LibraryRoot", async () => {
    fileAssetFindManyMock.mockResolvedValue([{ id: "fa-1" }, { id: "fa-2" }]);

    await removeLibraryRootServerFn({ data: { id: "root-1" } });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(fileAssetFindManyMock).toHaveBeenCalledWith({
      where: { libraryRootId: "root-1" },
      select: { id: true },
    });
    expect(cascadeCleanupOrphansMock).toHaveBeenCalledWith(
      expect.anything(),
      { fileAssetIds: ["fa-1", "fa-2"] },
    );
    expect(importJobDeleteManyMock).toHaveBeenCalledWith({
      where: { libraryRootId: "root-1" },
    });
    expect(libraryRootDeleteMock).toHaveBeenCalledWith({
      where: { id: "root-1" },
    });
  });

  it("skips cascadeCleanupOrphans when library has no files", async () => {
    fileAssetFindManyMock.mockResolvedValue([]);

    await removeLibraryRootServerFn({ data: { id: "root-1" } });

    expect(cascadeCleanupOrphansMock).not.toHaveBeenCalled();
    expect(importJobDeleteManyMock).toHaveBeenCalled();
    expect(libraryRootDeleteMock).toHaveBeenCalled();
  });
});

describe("scanLibraryRootServerFn", () => {
  beforeEach(() => {
    importJobCreateMock.mockReset();
    importJobUpdateMock.mockReset();
    enqueueLibraryJobMock.mockReset();
  });

  it("creates importJob with kind SCAN_ROOT, status QUEUED, and libraryRootId", async () => {
    importJobCreateMock.mockResolvedValue({ id: "job-abc" });
    enqueueLibraryJobMock.mockResolvedValue("bull-job-123");
    importJobUpdateMock.mockResolvedValue({});

    await scanLibraryRootServerFn({ data: { libraryRootId: "root-xyz" } });

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "SCAN_ROOT",
        status: "QUEUED",
        libraryRootId: "root-xyz",
        scanStage: "DISCOVERY",
      },
    });
  });

  it("calls enqueueLibraryJob with SCAN_LIBRARY_ROOT job name and correct payload", async () => {
    importJobCreateMock.mockResolvedValue({ id: "job-abc" });
    enqueueLibraryJobMock.mockResolvedValue("bull-job-123");
    importJobUpdateMock.mockResolvedValue({});

    await scanLibraryRootServerFn({ data: { libraryRootId: "root-xyz" } });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT,
      { libraryRootId: "root-xyz", importJobId: "job-abc" },
    );
  });

  it("updates importJob with bullmqJobId", async () => {
    importJobCreateMock.mockResolvedValue({ id: "job-abc" });
    enqueueLibraryJobMock.mockResolvedValue("bull-job-123");
    importJobUpdateMock.mockResolvedValue({});

    await scanLibraryRootServerFn({ data: { libraryRootId: "root-xyz" } });

    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "job-abc" },
      data: { bullmqJobId: "bull-job-123" },
    });
  });

  it("returns { jobId, importJobId }", async () => {
    importJobCreateMock.mockResolvedValue({ id: "job-abc" });
    enqueueLibraryJobMock.mockResolvedValue("bull-job-123");
    importJobUpdateMock.mockResolvedValue({});

    const result = await scanLibraryRootServerFn({
      data: { libraryRootId: "root-xyz" },
    });

    expect(result).toEqual({ jobId: "bull-job-123", importJobId: "job-abc" });
  });
});

describe("getScanProgressServerFn", () => {
  beforeEach(() => {
    importJobFindManyMock.mockReset();
    importJobUpdateMock.mockReset();
    importJobUpdateManyMock.mockReset();
    getImportJobLiveActivityMock.mockReset();
    getLibraryJobSnapshotMock.mockReset();
    getImportJobLiveActivityMock.mockResolvedValue(null);
  });

  it("returns progress data with stale: false for a recent live scan", async () => {
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "active", progress: null });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-1",
      bullmqJobId: "bull-1",
      status: "RUNNING",
      totalFiles: 100,
      processedFiles: 42,
      errorCount: 2,
      updatedAt: new Date(),
      scanStage: "DISCOVERY",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(importJobFindManyMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        kind: "SCAN_ROOT",
      },
      select: {
        id: true,
        bullmqJobId: true,
        status: true,
        totalFiles: true,
        processedFiles: true,
        errorCount: true,
        updatedAt: true,
        scanStage: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    expect(getLibraryJobSnapshotMock).toHaveBeenCalledWith("bull-1");
    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 100,
      processedFiles: 42,
      errorCount: 2,
      scanStage: "DISCOVERY",
      stale: false,
    });
  });

  it("returns stale: true when a live scan exceeds the threshold", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "waiting-children", progress: null });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-2",
      bullmqJobId: "bull-2",
      status: "RUNNING",
      totalFiles: 500,
      processedFiles: 200,
      errorCount: 0,
      updatedAt: sixMinutesAgo,
      scanStage: "PROCESSING",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 500,
      processedFiles: 200,
      errorCount: 0,
      scanStage: "PROCESSING",
      stale: true,
    });
  });

  it("normalizes queue-live scans to RUNNING even when the import row already says SUCCEEDED", async () => {
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "waiting-children", progress: null });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-succeeded",
      bullmqJobId: "bull-2",
      status: "SUCCEEDED",
      totalFiles: 500,
      processedFiles: 200,
      errorCount: 0,
      updatedAt: new Date(),
      scanStage: "PROCESSING",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 500,
      processedFiles: 200,
      errorCount: 0,
      scanStage: "PROCESSING",
      stale: false,
    });
  });

  it("uses live queue activity to suppress stale warnings during background processing", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    getLibraryJobSnapshotMock.mockResolvedValue({
      state: "waiting-children",
      progress: { processedFiles: 3490, errorCount: 0 },
      lastActivityAt: Date.now(),
    });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-processing",
      bullmqJobId: "bull-processing",
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      updatedAt: sixMinutesAgo,
      scanStage: "DISCOVERY",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      scanStage: "PROCESSING",
      stale: false,
    });
  });

  it("marks stale ghost scans as FAILED and returns null", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    getLibraryJobSnapshotMock.mockResolvedValue(null);
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-ghost",
      bullmqJobId: "bull-missing",
      status: "RUNNING",
      totalFiles: 500,
      processedFiles: 500,
      errorCount: 0,
      updatedAt: sixMinutesAgo,
      scanStage: "PROCESSING",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-ghost", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Scan job is no longer active in BullMQ",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(result).toBeNull();
  });

  it("marks queue-deadlocked scans as FAILED and returns null", async () => {
    getLibraryJobSnapshotMock.mockResolvedValue({
      state: "waiting-children",
      progress: { processedFiles: 3490, errorCount: 0, scanStage: "PROCESSING" },
      blockedByFailedChild: true,
    });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-deadlocked",
      bullmqJobId: "bull-deadlocked",
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      updatedAt: new Date(),
      scanStage: "PROCESSING",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-deadlocked", status: { not: "FAILED" } },
      data: {
        status: "FAILED",
        error: "Scan job is blocked by a failed child job",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(result).toBeNull();
  });

  it("returns null for scans without a BullMQ id", async () => {
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-no-bull",
      bullmqJobId: null,
      status: "QUEUED",
      totalFiles: null,
      processedFiles: null,
      errorCount: null,
      updatedAt: new Date(),
      scanStage: "DISCOVERY",
    }]);
    getImportJobLiveActivityMock.mockResolvedValue(null);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(getLibraryJobSnapshotMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("keeps a completed scan visible when descendant queue jobs are still live", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-fallback",
      bullmqJobId: null,
      status: "SUCCEEDED",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      updatedAt: sixMinutesAgo,
      scanStage: null,
    }]);
    getImportJobLiveActivityMock.mockResolvedValue({
      lastActivityAt: Date.now(),
      scanStage: "PROCESSING",
    });

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      scanStage: "PROCESSING",
      stale: false,
    });
  });

  it("returns null when no active scan exists", async () => {
    importJobFindManyMock.mockResolvedValue([]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toBeNull();
  });

  it("uses BullMQ progress to surface PROCESSING when the DB row is stale", async () => {
    getLibraryJobSnapshotMock.mockResolvedValue({
      state: "waiting-children",
      progress: { processedFiles: 3490, errorCount: 0, scanStage: "PROCESSING" },
    });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-live",
      bullmqJobId: "bull-live",
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      updatedAt: new Date(),
      scanStage: "DISCOVERY",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      scanStage: "PROCESSING",
      stale: false,
    });
  });

  it("infers PROCESSING from waiting-children even when BullMQ progress omits scanStage", async () => {
    getLibraryJobSnapshotMock.mockResolvedValue({
      state: "waiting-children",
      progress: { processedFiles: 3490, errorCount: 0 },
    });
    importJobFindManyMock.mockResolvedValue([{
      id: "ij-live",
      bullmqJobId: "bull-live",
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      updatedAt: new Date(),
      scanStage: "DISCOVERY",
    }]);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 3490,
      processedFiles: 3490,
      errorCount: 0,
      scanStage: "PROCESSING",
      stale: false,
    });
  });
});

describe("getLibraryIssueCountServerFn", () => {
  beforeEach(() => {
    fileAssetCountMock.mockReset();
  });

  it("counts file assets with unparseable metadata", async () => {
    fileAssetCountMock.mockResolvedValue(5);

    const result = await getLibraryIssueCountServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(fileAssetCountMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        metadata: { path: ["status"], equals: "unparseable" },
      },
    });
    expect(result).toBe(5);
  });
});

describe("getLibraryIssuesServerFn", () => {
  beforeEach(() => {
    fileAssetFindManyMock.mockReset();
    fileAssetCountMock.mockReset();
  });

  it("returns paginated file assets with parse errors", async () => {
    const fakeAssets = [
      {
        id: "fa-1",
        relativePath: "author/book.epub",
        mediaKind: "EPUB",
        metadata: { status: "unparseable", warnings: ["Bad XML"] },
        lastSeenAt: new Date("2025-01-01"),
      },
    ];
    fileAssetFindManyMock.mockResolvedValue(fakeAssets);
    fileAssetCountMock.mockResolvedValue(1);

    const result = await getLibraryIssuesServerFn({
      data: { libraryRootId: "root-1", page: 1, pageSize: 20 },
    });

    expect(fileAssetFindManyMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        metadata: { path: ["status"], equals: "unparseable" },
      },
      select: {
        id: true,
        relativePath: true,
        mediaKind: true,
        metadata: true,
        lastSeenAt: true,
      },
      orderBy: { relativePath: "asc" },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({ items: fakeAssets, total: 1 });
  });

  it("applies correct pagination offset", async () => {
    fileAssetFindManyMock.mockResolvedValue([]);
    fileAssetCountMock.mockResolvedValue(0);

    await getLibraryIssuesServerFn({
      data: { libraryRootId: "root-1", page: 3, pageSize: 10 },
    });

    expect(fileAssetFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

describe("retryLibraryIssuesServerFn", () => {
  beforeEach(() => {
    fileAssetFindManyMock.mockReset();
    parseFileAssetMetadataMock.mockReset();
    createIngestServicesMock.mockClear();
  });

  it("calls parseFileAssetMetadata for each unparseable file sequentially", async () => {
    const fakeAssets = [
      { id: "fa-1" },
      { id: "fa-2" },
      { id: "fa-3" },
    ];
    fileAssetFindManyMock.mockResolvedValue(fakeAssets);
    parseFileAssetMetadataMock.mockResolvedValue({ skipped: false });

    const result = await retryLibraryIssuesServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(fileAssetFindManyMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        metadata: { path: ["status"], equals: "unparseable" },
      },
      select: { id: true },
    });

    expect(createIngestServicesMock).toHaveBeenCalledWith({
      enqueueLibraryJob: expect.any(Function) as unknown,
    });

    // Verify the wrapper delegates to the real enqueueLibraryJob
    const calls = createIngestServicesMock.mock.calls as unknown as Array<
      Array<{ enqueueLibraryJob: (jobName: string, payload: unknown) => Promise<void> }>
    >;
    const firstCall = calls[0];
    if (!firstCall) throw new Error("expected createIngestServices call");
    const firstArg = firstCall[0];
    if (!firstArg) throw new Error("expected createIngestServices argument");
    enqueueLibraryJobMock.mockResolvedValue("job-id");
    await firstArg.enqueueLibraryJob("SOME_JOB", { fileAssetId: "fa-99" });
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("SOME_JOB", { fileAssetId: "fa-99" });

    expect(parseFileAssetMetadataMock).toHaveBeenCalledTimes(3);
    expect(parseFileAssetMetadataMock).toHaveBeenCalledWith({ fileAssetId: "fa-1" });
    expect(parseFileAssetMetadataMock).toHaveBeenCalledWith({ fileAssetId: "fa-2" });
    expect(parseFileAssetMetadataMock).toHaveBeenCalledWith({ fileAssetId: "fa-3" });

    expect(result).toEqual({ retriedCount: 3 });
  });

  it("returns retriedCount 0 when no issues exist", async () => {
    fileAssetFindManyMock.mockResolvedValue([]);

    const result = await retryLibraryIssuesServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(parseFileAssetMetadataMock).not.toHaveBeenCalled();
    expect(result).toEqual({ retriedCount: 0 });
  });
});
