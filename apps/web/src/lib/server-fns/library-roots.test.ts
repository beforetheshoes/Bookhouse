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
const importJobDeleteManyMock = vi.fn();
const importJobFindFirstMock = vi.fn();
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

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
      deleteMany: importJobDeleteManyMock,
      findFirst: importJobFindFirstMock,
    },
    $transaction: transactionMock,
  },
}));

const enqueueLibraryJobMock = vi.fn();
const LIBRARY_JOB_NAMES = { SCAN_LIBRARY_ROOT: "SCAN_LIBRARY_ROOT" };

vi.mock("@bookhouse/shared", () => ({
  enqueueLibraryJob: enqueueLibraryJobMock,
  LIBRARY_JOB_NAMES,
}));

import {
  getLibraryRootsServerFn,
  addLibraryRootServerFn,
  removeLibraryRootServerFn,
  scanLibraryRootServerFn,
  getScanProgressServerFn,
  getLibraryIssueCountServerFn,
  getLibraryIssuesServerFn,
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
    editionFileDeleteManyMock.mockReset();
    fileAssetDeleteManyMock.mockReset();
    importJobDeleteManyMock.mockReset();
    libraryRootDeleteMock.mockReset();
    transactionMock.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    editionFileDeleteManyMock.mockResolvedValue({ count: 0 });
    fileAssetDeleteManyMock.mockResolvedValue({ count: 0 });
    importJobDeleteManyMock.mockResolvedValue({ count: 0 });
    libraryRootDeleteMock.mockResolvedValue({ id: "root-1" });
  });

  it("calls db.$transaction with an array of 4 operations", async () => {
    await removeLibraryRootServerFn({ data: { id: "root-1" } });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    const firstCall = transactionMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const ops = firstCall?.[0];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops).toHaveLength(4);
  });

  it("deletes editionFiles, fileAssets, importJobs, and the libraryRoot", async () => {
    await removeLibraryRootServerFn({ data: { id: "root-1" } });

    expect(editionFileDeleteManyMock).toHaveBeenCalledWith({
      where: { fileAsset: { libraryRootId: "root-1" } },
    });
    expect(fileAssetDeleteManyMock).toHaveBeenCalledWith({
      where: { libraryRootId: "root-1" },
    });
    expect(importJobDeleteManyMock).toHaveBeenCalledWith({
      where: { libraryRootId: "root-1" },
    });
    expect(libraryRootDeleteMock).toHaveBeenCalledWith({
      where: { id: "root-1" },
    });
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
    importJobFindFirstMock.mockReset();
  });

  it("returns progress data for an active scan", async () => {
    importJobFindFirstMock.mockResolvedValue({
      status: "RUNNING",
      totalFiles: 100,
      processedFiles: 42,
      errorCount: 2,
    });

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(importJobFindFirstMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        kind: "SCAN_ROOT",
        status: { in: ["QUEUED", "RUNNING"] },
      },
      select: {
        status: true,
        totalFiles: true,
        processedFiles: true,
        errorCount: true,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual({
      status: "RUNNING",
      totalFiles: 100,
      processedFiles: 42,
      errorCount: 2,
    });
  });

  it("returns null when no active scan exists", async () => {
    importJobFindFirstMock.mockResolvedValue(null);

    const result = await getScanProgressServerFn({
      data: { libraryRootId: "root-1" },
    });

    expect(result).toBeNull();
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
