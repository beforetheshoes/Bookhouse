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

const findManyMock = vi.fn();
const countMock = vi.fn();
const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();
const workCountMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      findMany: findManyMock,
      count: countMock,
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
    work: {
      count: workCountMock,
    },
  },
}));

class MockNotFoundError extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}

const obliterateLibraryQueueMock = vi.fn().mockResolvedValue(undefined);
const getImportJobLiveActivityMock = vi.fn();
const getLibraryJobSnapshotMock = vi.fn();

vi.mock("@bookhouse/shared", () => ({
  NotFoundError: MockNotFoundError,
  getImportJobLiveActivity: (...args: unknown[]): unknown => getImportJobLiveActivityMock(...args),
  obliterateLibraryQueue: (...args: unknown[]): unknown => obliterateLibraryQueueMock(...args),
  getLibraryJobSnapshot: (...args: unknown[]): unknown => getLibraryJobSnapshotMock(...args),
}));

import {
  getImportJobsServerFn,
  getImportJobDetailServerFn,
  getActiveJobCountServerFn,
  stopAllJobsServerFn,
} from "./import-jobs";

describe("getImportJobsServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    countMock.mockReset();
    updateManyMock.mockReset();
    getImportJobLiveActivityMock.mockReset();
    getLibraryJobSnapshotMock.mockReset();
    getImportJobLiveActivityMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
  });

  it("returns jobs, totalCount, page, and pageSize", async () => {
    const fakeJobs = [{ id: "job-1" }];
    findManyMock.mockResolvedValue(fakeJobs);
    countMock.mockResolvedValue(42);

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result).toEqual({
      jobs: fakeJobs,
      totalCount: 42,
      page: 1,
      pageSize: 20,
    });
  });

  it("overrides stale SCAN_ROOT success rows with a live RUNNING status from BullMQ", async () => {
    findManyMock.mockResolvedValue([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      error: null,
      attemptsMade: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
    countMock.mockResolvedValue(1);
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "waiting-children", progress: null });

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result.jobs).toEqual([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "RUNNING",
      error: null,
      attemptsMade: 0,
      createdAt: expect.any(Date) as unknown,
      startedAt: expect.any(Date) as unknown,
      finishedAt: null,
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
  });

  it("keeps SCAN_ROOT rows running when descendant queue jobs are still live", async () => {
    findManyMock.mockResolvedValue([{
      id: "job-1",
      bullmqJobId: null,
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      error: null,
      attemptsMade: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      libraryRoot: { id: "root-1", name: "Audiobooks" },
    }]);
    countMock.mockResolvedValue(1);
    getImportJobLiveActivityMock.mockResolvedValue({
      lastActivityAt: Date.now(),
      scanStage: "PROCESSING",
    });

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result.jobs).toEqual([{
      id: "job-1",
      bullmqJobId: null,
      kind: "SCAN_ROOT",
      status: "RUNNING",
      error: null,
      attemptsMade: 0,
      createdAt: expect.any(Date) as unknown,
      startedAt: expect.any(Date) as unknown,
      finishedAt: null,
      libraryRoot: { id: "root-1", name: "Audiobooks" },
    }]);
  });

  it("leaves SCAN_ROOT rows unchanged when they have no BullMQ id and no descendant activity", async () => {
    findManyMock.mockResolvedValue([{
      id: "job-1",
      bullmqJobId: null,
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      error: null,
      attemptsMade: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      libraryRoot: { id: "root-1", name: "Audiobooks" },
    }]);
    countMock.mockResolvedValue(1);
    getImportJobLiveActivityMock.mockResolvedValue(null);

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result.jobs[0]).toMatchObject({
      bullmqJobId: null,
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      finishedAt: expect.any(Date) as unknown,
    });
  });

  it("keeps SCAN_ROOT rows running when BullMQ is no longer live but descendant queue jobs still are", async () => {
    findManyMock.mockResolvedValue([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      error: null,
      attemptsMade: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
    countMock.mockResolvedValue(1);
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "completed", progress: null });
    getImportJobLiveActivityMock.mockResolvedValue({
      lastActivityAt: Date.now(),
      scanStage: "PROCESSING",
    });

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result.jobs).toEqual([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "RUNNING",
      error: null,
      attemptsMade: 0,
      createdAt: expect.any(Date) as unknown,
      startedAt: expect.any(Date) as unknown,
      finishedAt: null,
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
  });

  it("leaves SCAN_ROOT rows unchanged when BullMQ is no longer live and no fallback activity exists", async () => {
    findManyMock.mockResolvedValue([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      error: null,
      attemptsMade: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
    countMock.mockResolvedValue(1);
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "completed", progress: null });
    getImportJobLiveActivityMock.mockResolvedValue(null);

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result.jobs[0]).toMatchObject({
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "SUCCEEDED",
      finishedAt: expect.any(Date) as unknown,
    });
  });

  it("overrides deadlocked SCAN_ROOT rows with FAILED status from BullMQ reconciliation", async () => {
    findManyMock.mockResolvedValue([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "RUNNING",
      error: null,
      attemptsMade: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
    countMock.mockResolvedValue(1);
    getLibraryJobSnapshotMock.mockResolvedValue({
      state: "waiting-children",
      progress: { processedFiles: 3490, errorCount: 0, scanStage: "PROCESSING" },
      blockedByFailedChild: true,
    });

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "job-1", status: { not: "FAILED" } },
      data: {
        status: "FAILED",
        error: "Scan job is blocked by a failed child job",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(result.jobs).toEqual([{
      id: "job-1",
      bullmqJobId: "bull-1",
      kind: "SCAN_ROOT",
      status: "FAILED",
      error: "Scan job is blocked by a failed child job",
      attemptsMade: 0,
      createdAt: expect.any(Date) as unknown,
      startedAt: expect.any(Date) as unknown,
      finishedAt: expect.any(Date) as unknown,
      libraryRoot: { id: "root-1", name: "eBooks" },
    }]);
  });

  it("calls findMany with status filter when status is provided (non-empty array)", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, status: ["QUEUED", "RUNNING"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["QUEUED", "RUNNING"] },
        }) as unknown,
      }),
    );
  });

  it("calls findMany WITHOUT status filter when status is not provided", async () => {
    await getImportJobsServerFn({ data: { page: 1, pageSize: 20 } });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("status");
  });

  it("calls findMany WITHOUT status filter when status is an empty array", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, status: [] },
    });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("status");
  });

  it("calls findMany with kind filter when kind is provided", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, kind: ["SCAN_ROOT", "HASH_FILE"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: { in: ["SCAN_ROOT", "HASH_FILE"] },
        }) as unknown,
      }),
    );
  });

  it("calls findMany WITHOUT kind filter when kind is an empty array", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, kind: [] },
    });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("kind");
  });

  it("calls findMany with libraryRootId filter when provided", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, libraryRootId: "root-abc" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ libraryRootId: "root-abc" }) as unknown,
      }),
    );
  });

  it("calls findMany WITHOUT libraryRootId filter when not provided", async () => {
    await getImportJobsServerFn({ data: { page: 1, pageSize: 20 } });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("libraryRootId");
  });

  it("uses correct skip/take for pagination (page 2, pageSize 10 → skip: 10, take: 10)", async () => {
    await getImportJobsServerFn({ data: { page: 2, pageSize: 10 } });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }) as unknown,
    );
  });
});

describe("getImportJobDetailServerFn", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("returns job when found", async () => {
    const fakeJob = { id: "job-1", kind: "SCAN_ROOT", status: "QUEUED" };
    findUniqueMock.mockResolvedValue(fakeJob);

    const result = await getImportJobDetailServerFn({ data: { id: "job-1" } });
    expect(result).toBe(fakeJob);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "job-1" },
      include: {
        libraryRoot: { select: { id: true, name: true, path: true } },
      },
    });
  });

  it("throws NotFoundError when job is null", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      getImportJobDetailServerFn({ data: { id: "missing-id" } }),
    ).rejects.toThrow("Import job not found");
  });
});

describe("getActiveJobCountServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    updateManyMock.mockReset();
    getImportJobLiveActivityMock.mockReset();
    getLibraryJobSnapshotMock.mockReset();
    getImportJobLiveActivityMock.mockResolvedValue(null);
  });

  it("queries non-failed scan-root import jobs", async () => {
    findManyMock.mockResolvedValue([]);
    await getActiveJobCountServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      where: { kind: "SCAN_ROOT", status: { not: "FAILED" } },
      select: { id: true, bullmqJobId: true, updatedAt: true, status: true },
    });
  });

  it("returns count of live scan-root jobs only", async () => {
    findManyMock.mockResolvedValue([
      { id: "ij-live-1", bullmqJobId: "bull-1", updatedAt: new Date(), status: "RUNNING" },
      { id: "ij-live-2", bullmqJobId: "bull-2", updatedAt: new Date(), status: "SUCCEEDED" },
      { id: "ij-dead", bullmqJobId: "bull-dead", updatedAt: new Date(), status: "RUNNING" },
    ]);
    getLibraryJobSnapshotMock
      .mockResolvedValueOnce({ state: "active", progress: null })
      .mockResolvedValueOnce({ state: "waiting-children", progress: null })
      .mockResolvedValueOnce(null);

    const result = await getActiveJobCountServerFn();
    expect(result).toBe(2);
  });

  it("does not count queue-deadlocked scan-root jobs as active", async () => {
    findManyMock.mockResolvedValue([
      { id: "ij-deadlocked", bullmqJobId: "bull-1", updatedAt: new Date(), status: "RUNNING" },
    ]);
    getLibraryJobSnapshotMock.mockResolvedValue({
      state: "waiting-children",
      progress: { scanStage: "PROCESSING" },
      blockedByFailedChild: true,
    });

    const result = await getActiveJobCountServerFn();

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-deadlocked", status: { not: "FAILED" } },
      data: {
        status: "FAILED",
        error: "Scan job is blocked by a failed child job",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(result).toBe(0);
  });

  it("marks stale ghost scan jobs as failed before counting", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    findManyMock.mockResolvedValue([
      { id: "ij-ghost", bullmqJobId: "bull-missing", updatedAt: sixMinutesAgo, status: "RUNNING" },
    ]);
    getLibraryJobSnapshotMock.mockResolvedValue(null);

    const result = await getActiveJobCountServerFn();

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-ghost", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Scan job is no longer active in BullMQ",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(result).toBe(0);
  });

  it("treats scan jobs without a BullMQ id as inactive", async () => {
    findManyMock.mockResolvedValue([
      { id: "ij-no-bull", bullmqJobId: null, updatedAt: new Date(), status: "QUEUED" },
    ]);
    getImportJobLiveActivityMock.mockResolvedValue(null);

    const result = await getActiveJobCountServerFn();

    expect(getLibraryJobSnapshotMock).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });

  it("counts scan jobs with live descendant queue work even after the parent row completed", async () => {
    findManyMock.mockResolvedValue([
      { id: "ij-fallback", bullmqJobId: null, updatedAt: new Date(), status: "SUCCEEDED" },
    ]);
    getImportJobLiveActivityMock.mockResolvedValue({
      lastActivityAt: Date.now(),
      scanStage: "PROCESSING",
    });

    const result = await getActiveJobCountServerFn();

    expect(result).toBe(1);
  });

  it("counts scan jobs with a BullMQ id when queue state is no longer live but descendant jobs still are", async () => {
    findManyMock.mockResolvedValue([
      { id: "ij-fallback", bullmqJobId: "bull-fallback", updatedAt: new Date(), status: "SUCCEEDED" },
    ]);
    getLibraryJobSnapshotMock.mockResolvedValue({ state: "completed", progress: null });
    getImportJobLiveActivityMock.mockResolvedValue({
      lastActivityAt: Date.now(),
      scanStage: "PROCESSING",
    });

    const result = await getActiveJobCountServerFn();

    expect(result).toBe(1);
  });
});

describe("stopAllJobsServerFn", () => {
  beforeEach(() => {
    obliterateLibraryQueueMock.mockClear();
    updateManyMock.mockReset();
  });

  it("obliterates queue and marks active jobs as FAILED", async () => {
    updateManyMock.mockResolvedValue({ count: 5 });

    const result = await stopAllJobsServerFn({} as never);

    expect(obliterateLibraryQueueMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", error: "Stopped by user", finishedAt: expect.any(Date) as unknown, bullmqJobId: null, scanStage: null },
    });
    expect(result).toEqual({ stoppedCount: 5 });
  });
});
