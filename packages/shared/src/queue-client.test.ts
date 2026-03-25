import { beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.fn();
const flushdbMock = vi.fn().mockResolvedValue("OK");
const getJobMock = vi.fn();
const getJobsMock = vi.fn();
const getStateMock = vi.fn();
const getDependenciesMock = vi.fn();
const redisConstructorMock = vi.fn();

vi.mock("ioredis", () => ({
  default: function FakeRedis(config: unknown) {
    redisConstructorMock(config);
    (this as Record<string, unknown>).flushdb = flushdbMock;
  },
}));

vi.mock("bullmq", () => ({
  Queue: class FakeQueue {
    add = addMock;
    getJob = getJobMock;
    getJobs = getJobsMock;
  },
}));

beforeEach(() => {
  vi.resetModules();
  addMock.mockReset();
  flushdbMock.mockClear();
  getJobMock.mockReset();
  getJobsMock.mockReset();
  getStateMock.mockReset();
  getDependenciesMock.mockReset();
  redisConstructorMock.mockClear();
  process.env.QUEUE_URL = "redis://localhost:6379";
});

describe("enqueueLibraryJob", () => {
  it("passes retry config for scan-library-root and reuses the queue singleton on repeated calls", async () => {
    addMock.mockResolvedValue({ id: "job-1" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    const jobId = await enqueueLibraryJob(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, {
      libraryRootId: "root-1",
    });
    // Second call — exercises the queueSingleton already-exists branch
    await enqueueLibraryJob(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, { libraryRootId: "root-2" });

    expect(jobId).toBe("job-1");
    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT];
    expect(addMock).toHaveBeenCalledWith(
      "scan-library-root",
      { libraryRootId: "root-1" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
    // IORedis and Queue constructors should only have been called once (singleton)
    expect(redisConstructorMock).toHaveBeenCalledTimes(1);
  });

  it("passes retry config for hash-file-asset", async () => {
    addMock.mockResolvedValueOnce({ id: "job-2" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.HASH_FILE_ASSET, {
      fileAssetId: "file-1",
    });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.HASH_FILE_ASSET];
    expect(addMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
  });

  it("passes retry config for parse-file-asset-metadata", async () => {
    addMock.mockResolvedValueOnce({ id: "job-3" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
      fileAssetId: "file-2",
    });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA];
    expect(addMock).toHaveBeenCalledWith(
      "parse-file-asset-metadata",
      { fileAssetId: "file-2" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
  });

  it("passes retry config for match-file-asset-to-edition", async () => {
    addMock.mockResolvedValueOnce({ id: "job-4" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
      fileAssetId: "file-3",
    });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION];
    expect(addMock).toHaveBeenCalledWith(
      "match-file-asset-to-edition",
      { fileAssetId: "file-3" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
  });

  it("passes retry config for process-cover", async () => {
    addMock.mockResolvedValueOnce({ id: "job-5" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
      workId: "work-1",
      fileAssetId: "file-4",
    });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.PROCESS_COVER];
    expect(addMock).toHaveBeenCalledWith(
      "process-cover",
      { workId: "work-1", fileAssetId: "file-4" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
  });

  it("passes retry config for detect-duplicates", async () => {
    addMock.mockResolvedValueOnce({ id: "job-6" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.DETECT_DUPLICATES, {
      fileAssetId: "file-5",
    });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.DETECT_DUPLICATES];
    expect(addMock).toHaveBeenCalledWith(
      "detect-duplicates",
      { fileAssetId: "file-5" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
  });

  it("returns 'unknown' when job.id is undefined", async () => {
    addMock.mockResolvedValueOnce({});
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES } = await import("./index");

    const jobId = await enqueueLibraryJob(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, {
      libraryRootId: "root-1",
    });

    expect(jobId).toBe("unknown");
  });

  it("passes parent and removeDependencyOnFailure when opts.parent is provided", async () => {
    addMock.mockResolvedValueOnce({ id: "job-parent" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.HASH_FILE_ASSET, {
      fileAssetId: "file-1",
    }, { parent: { id: "scan-1", queue: "bull:library" } });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.HASH_FILE_ASSET];
    expect(addMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1" },
      {
        attempts: config.attempts,
        backoff: config.backoff,
        priority: expect.any(Number) as unknown,
        parent: { id: "scan-1", queue: "bull:library" },
        removeDependencyOnFailure: true,
      },
    );
  });

  it("omits parent options when not provided", async () => {
    addMock.mockResolvedValueOnce({ id: "job-7" });
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, RETRY_CONFIG } = await import("./index");

    await enqueueLibraryJob(LIBRARY_JOB_NAMES.HASH_FILE_ASSET, {
      fileAssetId: "file-1",
    });

    const config = RETRY_CONFIG[LIBRARY_JOB_NAMES.HASH_FILE_ASSET];
    expect(addMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1" },
      { attempts: config.attempts, backoff: config.backoff, priority: expect.any(Number) as unknown },
    );
  });

  it("wraps queue errors in QueueError", async () => {
    addMock.mockRejectedValueOnce(new Error("Redis down"));
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES, QueueError } = await import("./index");

    await expect(
      enqueueLibraryJob(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, {
        libraryRootId: "root-1",
      }),
    ).rejects.toThrow(QueueError);
  });
});

describe("obliterateLibraryQueue", () => {
  it("calls flushdb using existing connection when singleton exists", async () => {
    addMock.mockResolvedValueOnce({ id: "job-1" });
    const { obliterateLibraryQueue, enqueueLibraryJob, LIBRARY_JOB_NAMES } = await import("./index");

    // Create singleton via enqueue first
    await enqueueLibraryJob(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, { libraryRootId: "root-1" });
    const constructorCallsBefore = redisConstructorMock.mock.calls.length;

    await obliterateLibraryQueue();

    // Should NOT have created a new connection
    expect(redisConstructorMock).toHaveBeenCalledTimes(constructorCallsBefore);
    expect(flushdbMock).toHaveBeenCalledTimes(1);
  });

  it("initializes queue singleton if not yet created", async () => {
    const { obliterateLibraryQueue } = await import("./index");

    await obliterateLibraryQueue();

    expect(redisConstructorMock).toHaveBeenCalledTimes(1);
    expect(flushdbMock).toHaveBeenCalledTimes(1);
  });
});

describe("getLibraryJobState", () => {
  it("returns the BullMQ job state when the job exists", async () => {
    getStateMock.mockResolvedValue("waiting-children");
    getDependenciesMock.mockResolvedValue({ unprocessed: [], failed: [] });
    getJobMock.mockResolvedValue({
      getState: getStateMock,
      getDependencies: getDependenciesMock,
      progress: { scanStage: "PROCESSING" },
    });
    const { getLibraryJobState } = await import("./index");

    await expect(getLibraryJobState("job-123")).resolves.toBe("waiting-children");
    expect(getJobMock).toHaveBeenCalledWith("job-123");
  });

  it("returns null when the BullMQ job does not exist", async () => {
    getJobMock.mockResolvedValue(null);
    const { getLibraryJobState } = await import("./index");

    await expect(getLibraryJobState("missing-job")).resolves.toBeNull();
  });
});

describe("getLibraryJobSnapshot", () => {
  it("returns state and progress when the BullMQ job exists", async () => {
    getStateMock.mockResolvedValue("waiting-children");
    getJobMock.mockResolvedValue({
      finishedOn: 0,
      getState: getStateMock,
      getDependencies: getDependenciesMock,
      processedOn: 123,
      progress: { processedFiles: 10, scanStage: "PROCESSING" },
      timestamp: 100,
    });
    getDependenciesMock.mockResolvedValue({ unprocessed: [], failed: [] });
    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 123,
      state: "waiting-children",
      progress: { processedFiles: 10, scanStage: "PROCESSING" },
    });
  });

  it("flags waiting-children jobs that are blocked by a failed descendant", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:child-1"],
            failed: [],
          }),
          processedOn: 100,
          progress: { processedFiles: 10, scanStage: "PROCESSING" },
          timestamp: 50,
        };
      }

      if (jobId === "child-1") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("failed"),
          getDependencies: vi.fn(),
          processedOn: 150,
          progress: 0,
          timestamp: 120,
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: true,
      lastActivityAt: 150,
      state: "waiting-children",
      progress: { processedFiles: 10, scanStage: "PROCESSING" },
    });
  });

  it("does not flag waiting-children when failed descendant has retries remaining", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:child-1"],
            failed: [],
          }),
          processedOn: 100,
          progress: { processedFiles: 10 },
          timestamp: 50,
        };
      }

      if (jobId === "child-1") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("failed"),
          getDependencies: vi.fn(),
          processedOn: 150,
          progress: 0,
          timestamp: 120,
          attemptsMade: 1,
          opts: { attempts: 3 },
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 150,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("flags waiting-children when failed descendant has exhausted all retries", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:child-1"],
            failed: [],
          }),
          processedOn: 100,
          progress: { processedFiles: 10 },
          timestamp: 50,
        };
      }

      if (jobId === "child-1") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("failed"),
          getDependencies: vi.fn(),
          processedOn: 150,
          progress: 0,
          timestamp: 120,
          attemptsMade: 3,
          opts: { attempts: 3 },
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: true,
      lastActivityAt: 150,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("flags waiting-children jobs when an unresolved descendant is missing", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:missing-child"],
            failed: [],
          }),
          processedOn: 100,
          progress: { processedFiles: 10 },
          timestamp: 50,
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: true,
      lastActivityAt: 100,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("ignores invalid dependency keys that resolve to an empty job id", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:"],
          }),
          processedOn: 100,
          progress: { processedFiles: 10 },
          timestamp: 50,
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 100,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("treats waiting-children jobs with no unprocessed dependency list as unblocked", async () => {
    getJobMock.mockResolvedValue({
      finishedOn: 0,
      getState: vi.fn().mockResolvedValue("waiting-children"),
      getDependencies: vi.fn().mockResolvedValue({}),
      processedOn: 100,
      progress: { processedFiles: 10 },
      timestamp: 50,
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 100,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("does not flag waiting-children jobs when a descendant has already completed", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:child-1"],
            failed: [],
          }),
          processedOn: 100,
          progress: { processedFiles: 10 },
          timestamp: 50,
        };
      }

      if (jobId === "child-1") {
        return {
          finishedOn: 175,
          getState: vi.fn().mockResolvedValue("completed"),
          getDependencies: vi.fn(),
          processedOn: 150,
          progress: 0,
          timestamp: 120,
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 175,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("flags waiting-children jobs when BullMQ already reports failed dependencies", async () => {
    getJobMock.mockResolvedValue({
      finishedOn: 0,
      getState: vi.fn().mockResolvedValue("waiting-children"),
      getDependencies: vi.fn().mockResolvedValue({
        unprocessed: [],
        failed: ["bull:library:child-1"],
      }),
      processedOn: 100,
      progress: { processedFiles: 10 },
      timestamp: 50,
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: true,
      lastActivityAt: 100,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("does not loop forever when waiting-children descendants reference the same job twice", async () => {
    getJobMock.mockImplementation((jobId: string) => {
      if (jobId === "job-123") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting-children"),
          getDependencies: vi.fn().mockResolvedValue({
            unprocessed: ["bull:library:child-1", "bull:library:child-1"],
            failed: [],
          }),
          processedOn: 100,
          progress: { processedFiles: 10 },
          timestamp: 50,
        };
      }

      if (jobId === "child-1") {
        return {
          finishedOn: 0,
          getState: vi.fn().mockResolvedValue("waiting"),
          getDependencies: vi.fn(),
          processedOn: 150,
          progress: 0,
          timestamp: 120,
        };
      }

      return null;
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 150,
      state: "waiting-children",
      progress: { processedFiles: 10 },
    });
  });

  it("returns direct activity timestamps for non-waiting-children jobs", async () => {
    getJobMock.mockResolvedValue({
      finishedOn: 0,
      getState: vi.fn().mockResolvedValue("active"),
      getDependencies: vi.fn(),
      processedOn: 300,
      progress: { processedFiles: 10 },
      timestamp: 250,
    });

    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("job-123")).resolves.toEqual({
      blockedByFailedChild: false,
      lastActivityAt: 300,
      state: "active",
      progress: { processedFiles: 10 },
    });
  });

  it("returns null when the BullMQ job does not exist", async () => {
    getJobMock.mockResolvedValue(null);
    const { getLibraryJobSnapshot } = await import("./index");

    await expect(getLibraryJobSnapshot("missing-job")).resolves.toBeNull();
  });
});

describe("getImportJobLiveActivity", () => {
  it("returns null when no live queue jobs match the import job id", async () => {
    getJobsMock.mockResolvedValue([]);
    const { getImportJobLiveActivity } = await import("./index");

    await expect(getImportJobLiveActivity("ij-1")).resolves.toBeNull();
  });

  it("returns processing activity when a live child job matches the import job id", async () => {
    getJobsMock
      .mockResolvedValueOnce([{
        data: { importJobId: "other-job" },
        finishedOn: 0,
        processedOn: 150,
        timestamp: 100,
      }])
      .mockResolvedValueOnce([{
        data: { importJobId: "ij-1" },
        finishedOn: 0,
        processedOn: 200,
        timestamp: 100,
      }])
      .mockResolvedValueOnce([]);

    const { getImportJobLiveActivity } = await import("./index");

    await expect(getImportJobLiveActivity("ij-1")).resolves.toEqual({
      lastActivityAt: 200,
      scanStage: "PROCESSING",
    });
    expect(getJobsMock).toHaveBeenNthCalledWith(1, ["active"], 0, 499, true);
    expect(getJobsMock).toHaveBeenNthCalledWith(2, ["prioritized"], 0, 499, true);
  });

  it("pages through active jobs when the first batch does not contain the matching import job", async () => {
    const activeBatch = Array.from({ length: 500 }, (_, index) => ({
      data: { importJobId: `other-${String(index)}` },
      finishedOn: 0,
      processedOn: 100,
      timestamp: 50,
    }));

    getJobsMock
      .mockResolvedValueOnce(activeBatch)
      .mockResolvedValueOnce([{
        data: { importJobId: "ij-1" },
        finishedOn: 0,
        processedOn: 275,
        timestamp: 125,
      }]);

    const { getImportJobLiveActivity } = await import("./index");

    await expect(getImportJobLiveActivity("ij-1")).resolves.toEqual({
      lastActivityAt: 275,
      scanStage: "PROCESSING",
    });
    expect(getJobsMock).toHaveBeenNthCalledWith(1, ["active"], 0, 499, true);
    expect(getJobsMock).toHaveBeenNthCalledWith(2, ["active"], 500, 999, true);
  });

  it("treats prioritized jobs as live import-job activity", async () => {
    getJobsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        data: { importJobId: "ij-1" },
        finishedOn: 0,
        processedOn: 250,
        timestamp: 100,
      }]);

    const { getImportJobLiveActivity } = await import("./index");

    await expect(getImportJobLiveActivity("ij-1")).resolves.toEqual({
      lastActivityAt: 250,
      scanStage: "PROCESSING",
    });
    expect(getJobsMock).toHaveBeenNthCalledWith(1, ["active"], 0, 499, true);
    expect(getJobsMock).toHaveBeenNthCalledWith(2, ["prioritized"], 0, 499, true);
  });
});
