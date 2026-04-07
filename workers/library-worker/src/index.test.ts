import { fileURLToPath } from "node:url";
import type * as SharedModule from "@bookhouse/shared";
import type { QueueProgressData } from "@bookhouse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

type WrappedEnqueue = (name: string, payload: Record<string, string | undefined>) => Promise<void>;
type IngestServicesConfig = { enqueueLibraryJob: WrappedEnqueue };
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
const mockLogger = { info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock };

const addMock = vi.fn();
const onMock = vi.fn();
const workerCloseMock = vi.fn(() => Promise.resolve(undefined));
const workerConstructorMock = vi.fn();
const queueConnectionConfigMock = vi.fn(() => ({ host: "localhost", port: 6379 }));
const quitMock = vi.fn(() => Promise.resolve("OK"));
const redisConstructorMock = vi.fn();
const cascadeCleanupOrphansMock = vi.fn();
const hashFileAssetMock = vi.fn();
const matchFileAssetToEditionMock = vi.fn();
const parseFileAssetMetadataMock = vi.fn();
const processCoverForWorkMock = vi.fn();
const scanLibraryRootMock = vi.fn();
const detectDuplicatesMock = vi.fn();
const matchSuggestionsMock = vi.fn();
const importJobUpdateMock = vi.fn();
const importJobUpdateManyMock = vi.fn();
const appSettingFindUniqueMock = vi.fn();
const enqueueLibraryJobMock = vi.fn();

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(config: object) {
      redisConstructorMock(config);
    }

    quit = quitMock;
  },
}));

class FakeWaitingChildrenError extends Error {
  constructor() {
    super("WaitingChildrenError");
    this.name = "WaitingChildrenError";
  }
}

vi.mock("bullmq", () => ({
  Worker: class FakeWorker {
    concurrency = 5;

    constructor(...args: object[]) {
      workerConstructorMock(...args);
    }

    on = onMock;
    close = workerCloseMock;
  },
  Job: function Job() { return {}; },
  Queue: class {
    add = addMock;
  },
  WaitingChildrenError: FakeWaitingChildrenError,
}));

const createIngestServicesMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: appSettingFindUniqueMock,
    },
    importJob: {
      update: importJobUpdateMock,
      updateMany: importJobUpdateManyMock,
    },
  },
}));

vi.mock("@bookhouse/ingest", () => ({
  createIngestServices: (deps?: object) => {
    createIngestServicesMock(deps);
    return {
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    };
  },
  hashFileAsset: hashFileAssetMock,
  matchFileAssetToEdition: matchFileAssetToEditionMock,
  parseFileAssetMetadata: parseFileAssetMetadataMock,
  processCoverForWorkDefault: () => processCoverForWorkMock,
  scanLibraryRoot: scanLibraryRootMock,
  detectDuplicates: detectDuplicatesMock,
  matchSuggestions: matchSuggestionsMock,
  cascadeCleanupOrphans: cascadeCleanupOrphansMock,
  enrichContributor: vi.fn(),
  searchOpenLibraryAuthors: vi.fn(),
  searchHardcoverAuthors: vi.fn(),
  searchWikidataAuthors: vi.fn().mockResolvedValue([]),
  applyAuthorPhotoFromUrl: vi.fn(),
  resizeAndSaveCover: vi.fn(),
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>(
    "@bookhouse/shared",
  );

  return {
    ...actual,
    createLogger: () => mockLogger,
    getQueueConnectionConfig: queueConnectionConfigMock,
    enqueueLibraryJob: enqueueLibraryJobMock,
  };
});

const moveToWaitingChildrenMock = vi.fn().mockResolvedValue(false);
const updateDataMock = vi.fn().mockResolvedValue(undefined);

function createMockJob(overrides: Record<string, string | number | boolean | object | null | undefined> = {}) {
  return {
    id: "job-1",
    opts: { attempts: 1 },
    queueQualifiedName: "bull:library",
    attemptsMade: 0,
    updateProgress: vi.fn(),
    moveToWaitingChildren: moveToWaitingChildrenMock,
    updateData: updateDataMock,
    ...overrides,
  };
}

beforeEach(() => {
  loggerInfoMock.mockReset();
  loggerWarnMock.mockReset();
  loggerErrorMock.mockReset();
  addMock.mockReset();
  createIngestServicesMock.mockReset();
  detectDuplicatesMock.mockReset();
  matchSuggestionsMock.mockReset();
  hashFileAssetMock.mockReset();
  importJobUpdateMock.mockReset();
  importJobUpdateMock.mockResolvedValue({});
  importJobUpdateManyMock.mockReset();
  importJobUpdateManyMock.mockResolvedValue({ count: 0 });
  enqueueLibraryJobMock.mockReset();
  matchFileAssetToEditionMock.mockReset();
  onMock.mockReset();
  parseFileAssetMetadataMock.mockReset();
  processCoverForWorkMock.mockReset();
  quitMock.mockReset();
  queueConnectionConfigMock.mockClear();
  redisConstructorMock.mockClear();
  scanLibraryRootMock.mockReset();
  workerCloseMock.mockReset();
  workerConstructorMock.mockClear();
  moveToWaitingChildrenMock.mockReset();
  moveToWaitingChildrenMock.mockResolvedValue(false);
  updateDataMock.mockReset();
  updateDataMock.mockResolvedValue(undefined);
  delete process.env.COVER_CACHE_DIR;
  delete process.env.NODE_ENV;
});

describe("library worker", () => {
  it("dispatches supported jobs to ingest handlers", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    hashFileAssetMock.mockResolvedValueOnce("hash-result");
    matchFileAssetToEditionMock.mockResolvedValueOnce("match-result");
    parseFileAssetMetadataMock.mockResolvedValueOnce("parse-result");
    processCoverForWorkMock.mockResolvedValueOnce("cover-result");

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1" },
        name: "scan-library-root",
      }) as never),
    ).resolves.toEqual({ missingFileAssetIds: [] });
    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1" },
        name: "hash-file-asset",
      }) as never),
    ).resolves.toBe("hash-result");
    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1" },
        name: "match-file-asset-to-edition",
      }) as never),
    ).resolves.toBe("match-result");
    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1" },
        name: "parse-file-asset-metadata",
      }) as never),
    ).resolves.toBe("parse-result");
    await expect(
      processor(createMockJob({
        data: { workId: "work-1", fileAssetId: "file-1" },
        name: "process-cover",
      }) as never),
    ).resolves.toBe("cover-result");

    detectDuplicatesMock.mockResolvedValueOnce("detect-result");
    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1" },
        name: "detect-duplicates",
      }) as never),
    ).resolves.toBe("detect-result");

    matchSuggestionsMock.mockResolvedValueOnce("match-suggestions-result");
    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1" },
        name: "match-suggestions",
      }) as never),
    ).resolves.toBe("match-suggestions-result");

    expect(matchSuggestionsMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(detectDuplicatesMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(scanLibraryRootMock).toHaveBeenCalledWith({ libraryRootId: "root-1" });
    expect(hashFileAssetMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(matchFileAssetToEditionMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(parseFileAssetMetadataMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(processCoverForWorkMock).toHaveBeenCalledWith({
      workId: "work-1",
      fileAssetId: "file-1",
      coverCacheDir: fileURLToPath(new URL("../../covers", import.meta.url)),
    });
  });

  it("passes a scan mode override through to ingest scanLibraryRoot", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", scanMode: "FULL" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(scanLibraryRootMock).toHaveBeenCalledWith({
      libraryRootId: "root-1",
      scanMode: "FULL",
    });
  });

  it("uses /data/covers as the production fallback when COVER_CACHE_DIR is unset", async () => {
    process.env.NODE_ENV = "production";

    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    processCoverForWorkMock.mockResolvedValueOnce("cover-result");

    await expect(
      processor(createMockJob({
        data: { workId: "work-1", fileAssetId: "file-1" },
        name: "process-cover",
      }) as never),
    ).resolves.toBe("cover-result");

    expect(processCoverForWorkMock).toHaveBeenCalledWith({
      workId: "work-1",
      fileAssetId: "file-1",
      coverCacheDir: "/data/covers",
    });
  });

  it("uses COVER_CACHE_DIR when it is configured", async () => {
    process.env.COVER_CACHE_DIR = "/tmp/bookhouse-covers";

    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    processCoverForWorkMock.mockResolvedValueOnce("cover-result");

    await expect(
      processor(createMockJob({
        data: { workId: "work-1", fileAssetId: "file-1" },
        name: "process-cover",
      }) as never),
    ).resolves.toBe("cover-result");

    expect(processCoverForWorkMock).toHaveBeenCalledWith({
      workId: "work-1",
      fileAssetId: "file-1",
      coverCacheDir: "/tmp/bookhouse-covers",
    });
  });

  it("updates ImportJob to RUNNING when importJobId is present on scan job", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
      attemptsMade: 1,
    }) as never, "test-token");

    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "ij-1" },
      data: { status: "RUNNING", startedAt: expect.any(Date) as Date, attemptsMade: 1 },
    });
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-1", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as Date, scanStage: null, bullmqJobId: null },
    });
  });

  it("does not set RUNNING or update parent progress for child jobs with importJobId", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockResolvedValueOnce("hash-result");
    const mockJob = createMockJob({
      data: { fileAssetId: "file-1", importJobId: "ij-child" },
      name: "hash-file-asset",
    });
    await processor(mockJob as never);

    expect(importJobUpdateMock).not.toHaveBeenCalled();
    expect(mockJob.updateProgress).not.toHaveBeenCalled();
  });

  it("does not update ImportJob for child jobs without importJobId", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockResolvedValueOnce("hash-result");

    await processor(createMockJob({
      data: { fileAssetId: "file-1" },
      name: "hash-file-asset",
    }) as never);

    expect(importJobUpdateMock).not.toHaveBeenCalled();
  });

  it("updates ImportJob to FAILED when handler throws and importJobId is present", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockRejectedValueOnce(new Error("Disk full"));

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-2" },
        name: "scan-library-root",
        attemptsMade: 2,
      }) as never, "test-token"),
    ).rejects.toThrow("Disk full");

    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-2" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date) as Date,
        error: "Disk full",
        attemptsMade: 2,
        scanStage: null,
        bullmqJobId: null,
      },
    });
  });

  it("records String(error) when a non-Error value is thrown with importJobId", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockRejectedValueOnce("plain string error");

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-3" },
        name: "scan-library-root",
        attemptsMade: 1,
      }) as never, "test-token"),
    ).rejects.toBe("plain string error");

    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-3" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date) as Date,
        error: "plain string error",
        attemptsMade: 1,
        scanStage: null,
        bullmqJobId: null,
      },
    });
  });

  it("skips ImportJob updates when importJobId is absent", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      attemptsMade: 0,
    }) as never, "test-token");

    expect(importJobUpdateMock).not.toHaveBeenCalled();
  });

  it("passes reportProgress to scanLibraryRoot that updates ImportJob and job progress", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    const updateProgressMock = vi.fn();
    scanLibraryRootMock.mockImplementationOnce(async (input: { reportProgress?: (data: QueueProgressData) => Promise<void> }) => {
      if (input.reportProgress) {
        await input.reportProgress({ totalFiles: 100 });
        await input.reportProgress({ processedFiles: 50, errorCount: 1 });
      }
      return { missingFileAssetIds: [] };
    });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-progress" },
      name: "scan-library-root",
      attemptsMade: 0,
      updateProgress: updateProgressMock,
    }) as never, "test-token");

    // importJob.update should have been called: RUNNING, progress(totalFiles), progress(processedFiles), SUCCEEDED
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-progress" },
      data: { totalFiles: 100 },
    });
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-progress" },
      data: { processedFiles: 50, errorCount: 1 },
    });
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-progress", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as Date, scanStage: null, bullmqJobId: null },
    });
    // job.updateProgress should have been called for each progress report
    expect(updateProgressMock).toHaveBeenCalledWith({ totalFiles: 100 });
    expect(updateProgressMock).toHaveBeenCalledWith({ processedFiles: 50, errorCount: 1 });
  });

  it("continues the scan when reportProgress persistence fails", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    importJobUpdateMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("progress db down"))
      .mockResolvedValueOnce({});

    scanLibraryRootMock.mockImplementationOnce(async (input: { reportProgress?: (data: QueueProgressData) => Promise<void> }) => {
      await input.reportProgress?.({ processedFiles: 50, errorCount: 1, scanStage: "PROCESSING" });
      return { missingFileAssetIds: [] };
    });

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-progress-fail" },
        name: "scan-library-root",
        attemptsMade: 0,
      }) as never, "test-token"),
    ).resolves.toEqual({ missingFileAssetIds: [] });
  });

  it("does not pass reportProgress to scanLibraryRoot when importJobId is absent", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      attemptsMade: 0,
    }) as never, "test-token");

    // scanLibraryRoot should be called WITHOUT reportProgress
    expect(scanLibraryRootMock).toHaveBeenCalledWith({ libraryRootId: "root-1" });
  });

  it("fails unknown jobs", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await expect(
      processor(createMockJob({
        data: {},
        name: "unknown-job",
      }) as never),
    ).rejects.toThrow("Unsupported library job: unknown-job");
  });

  it("creates per-job services with parent-aware enqueue when handlers not provided", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      id: "scan-job-42",
      queueQualifiedName: "bull:library",
    }) as never, "test-token");

    expect(createIngestServicesMock).toHaveBeenCalledTimes(1);
    const [[firstArg]] = createIngestServicesMock.mock.calls as object as [[IngestServicesConfig]];
    expect(firstArg).toHaveProperty("enqueueLibraryJob");
  });

  it("wrapped enqueue passes payload with scanJobId/scanQueueName and parent option to enqueueLibraryJob", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const { enqueueLibraryJob: enqueueLibraryJobMock } = await import("@bookhouse/shared");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      id: "scan-job-42",
      queueQualifiedName: "bull:library",
    }) as never, "test-token");

    // Get the wrapped enqueue from the createIngestServices call
    const [[{ enqueueLibraryJob: wrappedEnqueue }]] = createIngestServicesMock.mock.calls as object as [[IngestServicesConfig]];

    // Call the wrapped enqueue and verify it passes scanJobId, scanQueueName and parent option
    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1", scanJobId: "scan-job-42", scanQueueName: "bull:library" },
      { parent: { id: "scan-job-42", queue: "bull:library" } },
    );
  });

  it("wrapped enqueue uses empty string for scanJobId when job.id is undefined", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const { enqueueLibraryJob: enqueueLibraryJobMock } = await import("@bookhouse/shared");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      id: undefined,
      queueQualifiedName: "bull:library",
    }) as never, "test-token");

    const [[{ enqueueLibraryJob: wrappedEnqueue }]] = createIngestServicesMock.mock.calls as object as [[IngestServicesConfig]];

    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1", scanJobId: "", scanQueueName: "bull:library" },
      { parent: { id: "", queue: "bull:library" } },
    );
  });

  it("wrapped enqueue threads importJobId from parent job into child payloads", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const { enqueueLibraryJob: enqueueLibraryJobMock } = await import("@bookhouse/shared");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-42" },
      name: "scan-library-root",
      id: "scan-job-42",
      queueQualifiedName: "bull:library",
    }) as never, "test-token");

    const [[{ enqueueLibraryJob: wrappedEnqueue }]] = createIngestServicesMock.mock.calls as object as [[IngestServicesConfig]];

    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1", importJobId: "ij-42", scanJobId: "scan-job-42", scanQueueName: "bull:library" },
      { parent: { id: "scan-job-42", queue: "bull:library" } },
    );
  });

  it("cleans up stale QUEUED/RUNNING ImportJobs when new scan starts", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-new" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        status: { in: ["QUEUED", "RUNNING"] },
        id: { not: "ij-new" },
      },
      data: {
        status: "FAILED",
        error: "Superseded by new scan",
        finishedAt: expect.any(Date) as Date,
        bullmqJobId: null,
      },
    });
  });

  it("calls cascadeCleanupOrphans after scan when missingFileBehavior is auto-cleanup and scan has missing files", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: ["fa-1", "fa-2"] });
    appSettingFindUniqueMock.mockReset();
    appSettingFindUniqueMock.mockResolvedValueOnce({ key: "missingFileBehavior", value: "auto-cleanup" });
    cascadeCleanupOrphansMock.mockClear();

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "missingFileBehavior" } });
    expect(cascadeCleanupOrphansMock).toHaveBeenCalledWith(
      expect.anything(),
      { fileAssetIds: ["fa-1", "fa-2"] },
    );
  });

  it("does not call cascadeCleanupOrphans when missingFileBehavior is manual", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: ["fa-1"] });
    appSettingFindUniqueMock.mockReset();
    appSettingFindUniqueMock.mockResolvedValueOnce(null); // defaults to manual
    cascadeCleanupOrphansMock.mockClear();
    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(cascadeCleanupOrphansMock).not.toHaveBeenCalled();
  });

  it("does not call cascadeCleanupOrphans when scan has no missing files", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    cascadeCleanupOrphansMock.mockClear();
    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(cascadeCleanupOrphansMock).not.toHaveBeenCalled();
  });

  it("enters completion phase when step is waiting-children and marks SUCCEEDED for scan with importJobId", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-complete", step: "waiting-children" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(scanLibraryRootMock).not.toHaveBeenCalled();
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-complete", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as Date, scanStage: null, bullmqJobId: null },
    });
  });

  it("tolerates missing ImportJob during waiting-children completion phase", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });
    importJobUpdateMock.mockRejectedValueOnce({
      code: "P2025",
      name: "PrismaClientKnownRequestError",
    });

    await expect(processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-missing", step: "waiting-children" },
      name: "scan-library-root",
    }) as never, "test-token")).resolves.toBeUndefined();

    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ importJobId: "ij-missing", jobId: "job-1", jobName: "scan-library-root" }),
      "ImportJob missing during completion phase; skipping SUCCEEDED update",
    );
  });

  it("rethrows unexpected completion phase ImportJob update errors", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });
    const expectedError = new Error("db unavailable");
    importJobUpdateMock.mockRejectedValueOnce(expectedError);

    await expect(processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-error", step: "waiting-children" },
      name: "scan-library-root",
    }) as never, "test-token")).rejects.toThrow("db unavailable");

    expect(loggerWarnMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ importJobId: "ij-error" }),
      "ImportJob missing during completion phase; skipping SUCCEEDED update",
    );
  });

  it("skips activeScanType reset in completion phase for non-scan jobs", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await processor(createMockJob({
      data: { fileAssetId: "file-1", step: "waiting-children" },
      name: "hash-file-asset",
    }) as never, "test-token");

    expect(hashFileAssetMock).not.toHaveBeenCalled();
    expect(importJobUpdateMock).not.toHaveBeenCalled();
  });

  it("enters completion phase without updating ImportJob when importJobId is absent", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", step: "waiting-children" },
      name: "scan-library-root",
    }) as never, "test-token");

    expect(scanLibraryRootMock).not.toHaveBeenCalled();
    expect(importJobUpdateMock).not.toHaveBeenCalled();
  });

  it("calls moveToWaitingChildren and throws WaitingChildrenError when shouldWait is true", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    moveToWaitingChildrenMock.mockResolvedValueOnce(true);

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-wait" },
        name: "scan-library-root",
      }) as never, "test-token"),
    ).rejects.toThrow("WaitingChildrenError");

    expect(updateDataMock).toHaveBeenCalledWith({
      libraryRootId: "root-1",
      importJobId: "ij-wait",
      step: "waiting-children",
    });
    expect(moveToWaitingChildrenMock).toHaveBeenCalledWith("test-token");
  });

  it("re-throws WaitingChildrenError without marking ImportJob FAILED", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    moveToWaitingChildrenMock.mockResolvedValueOnce(true);

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-wait-rethrow" },
        name: "scan-library-root",
      }) as never, "test-token"),
    ).rejects.toThrow("WaitingChildrenError");

    // Should NOT have written FAILED — only RUNNING was written
    expect(importJobUpdateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }) as object,
    }));
  });

  it("marks the parent scan FAILED when a child job exhausts retries", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockRejectedValueOnce(new Error("hash failed"));

    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1", importJobId: "ij-child-fail" },
        opts: { attempts: 1 },
        name: "hash-file-asset",
      }) as never),
    ).rejects.toThrow("hash failed");

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-child-fail", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Child job hash-file-asset failed: hash failed",
        finishedAt: expect.any(Date) as Date,
        scanStage: null,
        bullmqJobId: null,
      },
    });
  });

  it("records String(error) for final child job failures when opts are missing", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockRejectedValueOnce("plain child failure");

    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1", importJobId: "ij-child-string-fail" },
        name: "hash-file-asset",
        opts: {},
      }) as never),
    ).rejects.toBe("plain child failure");

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-child-string-fail", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Child job hash-file-asset failed: plain child failure",
        finishedAt: expect.any(Date) as Date,
        scanStage: null,
        bullmqJobId: null,
      },
    });
  });

  it("marks ImportJob FAILED for final child failure", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockRejectedValueOnce(new Error("hash failed"));

    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1", importJobId: "ij-child-no-parent" },
        opts: { attempts: 1 },
        name: "hash-file-asset",
      }) as never),
    ).rejects.toThrow("hash failed");

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ij-child-no-parent", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Child job hash-file-asset failed: hash failed",
        finishedAt: expect.any(Date) as Date,
        scanStage: null,
        bullmqJobId: null,
      },
    });
  });

  it("does not mark ImportJob FAILED for non-final child failures", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockRejectedValueOnce(new Error("transient"));

    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1", importJobId: "ij-child-retry" },
        opts: { attempts: 3 },
        attemptsMade: 0,
        name: "hash-file-asset",
      }) as never),
    ).rejects.toThrow("transient");

    expect(importJobUpdateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "ij-child-retry" }) as object,
    }));
  });

  it("creates and shuts down a redis-backed worker", async () => {
    const { createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    expect(queueConnectionConfigMock).toHaveBeenCalledTimes(1);
    expect(redisConstructorMock).toHaveBeenCalledWith({ host: "localhost", port: 6379 });
    expect(workerConstructorMock).toHaveBeenCalledWith(
      "library",
      expect.any(Function),
      {
        connection: expect.any(Object) as object,
        concurrency: 5,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);

    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(quitMock).toHaveBeenCalledTimes(1);
  });

  it("bootstraps the worker, registers event handlers and shutdown hooks", async () => {
    const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { bootstrapLibraryWorker } = await import("./index");

    bootstrapLibraryWorker();

    expect(onMock).toHaveBeenCalledTimes(3);
    expect(onMock).toHaveBeenNthCalledWith(1, "ready", expect.any(Function));
    expect(onMock).toHaveBeenNthCalledWith(2, "completed", expect.any(Function));
    expect(onMock).toHaveBeenNthCalledWith(3, "failed", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    const shutdownHandler = processOnSpy.mock.calls.find(([event]) => event === "SIGINT")?.[1] as () => void;
    shutdownHandler();
    // Also invoke SIGTERM handler to cover that function body
    const sigtermHandler = processOnSpy.mock.calls.find(([event]) => event === "SIGTERM")?.[1] as () => void;
    sigtermHandler();
    // Allow the async shutdown() chain to complete (workerClose + quit + process.exit)
    // Allow the async shutdown() and dynamic enrichment worker import to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(processExitSpy).toHaveBeenCalledWith(0);

    // Invoke event callbacks to cover their bodies
    const readyCallback = onMock.mock.calls.find(([e]) => e === "ready")?.[1] as () => void;
    readyCallback();

    const completedCallback = onMock.mock.calls.find(([e]) => e === "completed")?.[1] as (job: { id?: string; name?: string } | undefined) => void;
    completedCallback({ id: "job-1", name: "scan-library-root" });

    const failedCallback = onMock.mock.calls.find(([e]) => e === "failed")?.[1] as (job: { id?: string; name?: string } | undefined, err: Error) => void;
    failedCallback({ id: "job-1", name: "scan-library-root" }, new Error("disk full"));
    failedCallback(undefined, new Error("no job ref"));

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("logEnrichmentWorkerError logs the error", async () => {
    const { logEnrichmentWorkerError } = await import("./index");
    logEnrichmentWorkerError(new Error("test error"));
  });

  it("handleEnrichmentWorkerModule calls startEnrichmentWorker", async () => {
    const { handleEnrichmentWorkerModule } = await import("./index");
    const mock = { startEnrichmentWorker: vi.fn() };
    handleEnrichmentWorkerModule(mock);
    expect(mock.startEnrichmentWorker).toHaveBeenCalled();
  });

  it("polls DB for concurrency using onDemand key when no scan is active", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockResolvedValue({ key: "concurrencyOnDemand", value: "7" });
    const { createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "concurrencyOnDemand" } });
    expect(created.worker.concurrency).toBe(7);

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("uses default onDemand concurrency when no setting exists in DB", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockResolvedValue(null);
    const { createLibraryWorker, shutdownLibraryWorker, SCAN_CONCURRENCY_DEFAULTS } = await import("./index");
    const created = createLibraryWorker();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(created.worker.concurrency).toBe(SCAN_CONCURRENCY_DEFAULTS.onDemand);

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("shuts down cleanly without pollInterval", async () => {
    const { shutdownLibraryWorker } = await import("./index");

    await shutdownLibraryWorker({ close: workerCloseMock }, { quit: quitMock } as never);

    expect(workerCloseMock).toHaveBeenCalled();
    expect(quitMock).toHaveBeenCalled();
  });

  it("force-exits when shutdown exceeds timeout", async () => {
    vi.useFakeTimers();
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const hangingClose = vi.fn(() => new Promise<void>(() => { /* never resolves */ }));
    const { shutdownLibraryWorker, SHUTDOWN_TIMEOUT_MS } = await import("./index");

    const shutdownPromise = shutdownLibraryWorker(
      { close: hangingClose },
      { quit: quitMock } as never,
    );

    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);

    expect(processExitSpy).toHaveBeenCalledWith(1);

    processExitSpy.mockRestore();
    vi.useRealTimers();
    // Prevent unhandled promise — shutdownPromise will never resolve since close hangs
    void shutdownPromise.catch(() => {});
  });

  it("keeps current concurrency when DB is unavailable", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockRejectedValue(new Error("DB down"));
    const { createLibraryWorker, shutdownLibraryWorker, SCAN_CONCURRENCY_DEFAULTS } = await import("./index");
    const created = createLibraryWorker();

    await vi.advanceTimersByTimeAsync(10_000);

    // Should still be default concurrency
    expect(created.worker.concurrency).toBe(SCAN_CONCURRENCY_DEFAULTS.onDemand);

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("deriveScanType returns full for FULL scanMode", async () => {
    const { deriveScanType } = await import("./index");
    expect(deriveScanType({ libraryRootId: "r1", scanMode: "FULL" })).toBe("full");
    expect(deriveScanType({ libraryRootId: "r1", scanMode: "FULL", scanTrigger: "manual" })).toBe("full");
    expect(deriveScanType({ libraryRootId: "r1", scanMode: "FULL", scanTrigger: "scheduled" })).toBe("full");
  });

  it("deriveScanType returns onDemand for INCREMENTAL manual trigger", async () => {
    const { deriveScanType } = await import("./index");
    expect(deriveScanType({ libraryRootId: "r1", scanMode: "INCREMENTAL", scanTrigger: "manual" })).toBe("onDemand");
    expect(deriveScanType({ libraryRootId: "r1", scanMode: "INCREMENTAL" })).toBe("onDemand");
    expect(deriveScanType({ libraryRootId: "r1" })).toBe("onDemand");
  });

  it("deriveScanType returns incremental for INCREMENTAL scheduled trigger", async () => {
    const { deriveScanType } = await import("./index");
    expect(deriveScanType({ libraryRootId: "r1", scanMode: "INCREMENTAL", scanTrigger: "scheduled" })).toBe("incremental");
    expect(deriveScanType({ libraryRootId: "r1", scanTrigger: "scheduled" })).toBe("incremental");
  });

  it("polls concurrency using active scan type when set directly", async () => {
    appSettingFindUniqueMock.mockResolvedValue({ key: "concurrencyFull", value: "10" });
    const { _pollConcurrency, _setActiveScanType, _getActiveScanType } = await import("./index");

    _setActiveScanType("full");
    expect(_getActiveScanType()).toBe("full");

    const fakeWorker = { concurrency: 5 };
    await _pollConcurrency(fakeWorker);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "concurrencyFull" } });
    expect(fakeWorker.concurrency).toBe(10);

    _setActiveScanType(null);
    expect(_getActiveScanType()).toBe("onDemand");
  });

  it("logs warning when DB is unavailable during concurrency poll", async () => {
    appSettingFindUniqueMock.mockRejectedValue(new Error("DB down"));
    const { _pollConcurrency } = await import("./index");

    const fakeWorker = { concurrency: 5 };
    await _pollConcurrency(fakeWorker);

    expect(fakeWorker.concurrency).toBe(5);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: "DB down" },
      "Failed to poll concurrency settings",
    );
  });

  it("logs non-Error throw as string when DB poll fails", async () => {
    appSettingFindUniqueMock.mockRejectedValue("CONNECTION_RESET");
    const { _pollConcurrency } = await import("./index");

    const fakeWorker = { concurrency: 5 };
    await _pollConcurrency(fakeWorker);

    expect(fakeWorker.concurrency).toBe(5);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: "CONNECTION_RESET" },
      "Failed to poll concurrency settings",
    );
  });

  it("polls DB using concurrencyIncremental key when an incremental scan is active", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockImplementation((args: { where: { key: string } }) => {
      if (args.where.key === "concurrencyIncremental") return Promise.resolve({ key: "concurrencyIncremental", value: "4" });
      return Promise.resolve(null);
    });
    let resolveScan: ((v: { missingFileAssetIds: string[] }) => void) | undefined;
    scanLibraryRootMock.mockReturnValue(new Promise((r) => { resolveScan = r; }));

    const { createLibraryWorkerProcessor, createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    const processor = createLibraryWorkerProcessor();
    const scanPromise = processor(createMockJob({
      data: { libraryRootId: "root-1", scanTrigger: "scheduled" },
      name: "scan-library-root",
    }) as never, "test-token");

    // Advance to trigger the poll and flush microtasks so pollConcurrency completes
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "concurrencyIncremental" } });
    expect(created.worker.concurrency).toBe(4);

    if (resolveScan) resolveScan({ missingFileAssetIds: [] });
    await scanPromise;

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("polls DB using concurrencyFull key when a full scan is active", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockImplementation((args: { where: { key: string } }) => {
      if (args.where.key === "concurrencyFull") return Promise.resolve({ key: "concurrencyFull", value: "12" });
      return Promise.resolve(null);
    });
    // Make the scan hang so activeScanType stays set during the poll
    let resolveScan: ((v: { missingFileAssetIds: string[] }) => void) | undefined;
    scanLibraryRootMock.mockReturnValue(new Promise((r) => { resolveScan = r; }));

    const { createLibraryWorkerProcessor, createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    // Start a FULL scan (don't await — it's hanging)
    const processor = createLibraryWorkerProcessor();
    const scanPromise = processor(createMockJob({
      data: { libraryRootId: "root-1", scanMode: "FULL" },
      name: "scan-library-root",
    }) as never, "test-token");

    // Poll fires while scan is in progress
    await vi.advanceTimersByTimeAsync(10_000);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "concurrencyFull" } });
    expect(created.worker.concurrency).toBe(12);

    // Clean up: resolve the scan and await completion
    if (resolveScan) resolveScan({ missingFileAssetIds: [] });
    await scanPromise;

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("boots automatically when imported as the entrypoint script", async () => {
    vi.resetModules();
    const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    const originalArgv = [...process.argv];

    process.argv[1] = fileURLToPath(new URL("./index.ts", import.meta.url));

    await import("./index");

    expect(onMock).toHaveBeenCalledWith("ready", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));

    process.argv.splice(0, process.argv.length, ...originalArgv);
    processOnSpy.mockRestore();
  });
});
