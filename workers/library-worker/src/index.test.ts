import { fileURLToPath } from "node:url";
import type * as SharedModule from "@bookhouse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const enrichWorkMock = vi.fn();
const detectDuplicatesMock = vi.fn();
const matchSuggestionsMock = vi.fn();
const importJobUpdateMock = vi.fn();
const importJobUpdateManyMock = vi.fn();
const appSettingFindUniqueMock = vi.fn();
const moveToWaitingChildrenMock = vi.fn();
const getDependenciesCountMock = vi.fn();
const removeChildDependencyMock = vi.fn();
const updateDataMock = vi.fn();
const enqueueLibraryJobMock = vi.fn();

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(config: unknown) {
      redisConstructorMock(config);
    }

    quit = quitMock;
  },
}));

class FakeWaitingChildrenError extends Error {
  constructor() {
    super("WaitingChildren");
    this.name = "WaitingChildrenError";
  }
}

vi.mock("bullmq", () => ({
  Worker: class FakeWorker {
    concurrency = 5;

    constructor(...args: unknown[]) {
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

const workFindUniqueMock = vi.fn();
const externalLinkUpsertMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: (...args: unknown[]): unknown => appSettingFindUniqueMock(...args),
    },
    importJob: {
      update: importJobUpdateMock,
      updateMany: importJobUpdateManyMock,
    },
    work: {
      findUnique: (...args: unknown[]): unknown => workFindUniqueMock(...args),
    },
    externalLink: {
      upsert: (...args: unknown[]): unknown => externalLinkUpsertMock(...args),
    },
  },
}));

vi.mock("@bookhouse/ingest", () => ({
  createIngestServices: (...args: unknown[]) => {
    createIngestServicesMock(...args);
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
  enrichWork: enrichWorkMock,
  detectDuplicates: detectDuplicatesMock,
  matchSuggestions: matchSuggestionsMock,
  searchOpenLibrary: vi.fn(),
  getOpenLibraryWork: vi.fn(),
  RateLimiter: class { check = () => ({ allowed: true }); },
  cascadeCleanupOrphans: cascadeCleanupOrphansMock,
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>(
    "@bookhouse/shared",
  );

  return {
    ...(actual as Record<string, unknown>),
    getQueueConnectionConfig: queueConnectionConfigMock,
    enqueueLibraryJob: enqueueLibraryJobMock,
  };
});

function createMockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    opts: { attempts: 1 },
    queueQualifiedName: "bull:library",
    attemptsMade: 0,
    moveToWaitingChildren: moveToWaitingChildrenMock,
    getDependenciesCount: getDependenciesCountMock,
    removeChildDependency: removeChildDependencyMock,
    updateData: updateDataMock,
    updateProgress: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  addMock.mockReset();
  createIngestServicesMock.mockReset();
  detectDuplicatesMock.mockReset();
  matchSuggestionsMock.mockReset();
  enrichWorkMock.mockReset();
  hashFileAssetMock.mockReset();
  importJobUpdateMock.mockReset();
  importJobUpdateMock.mockResolvedValue({});
  importJobUpdateManyMock.mockReset();
  importJobUpdateManyMock.mockResolvedValue({ count: 0 });
  enqueueLibraryJobMock.mockReset();
  matchFileAssetToEditionMock.mockReset();
  moveToWaitingChildrenMock.mockReset();
  moveToWaitingChildrenMock.mockResolvedValue(false);
  getDependenciesCountMock.mockReset();
  getDependenciesCountMock.mockResolvedValue({
    processed: 0,
    unprocessed: 0,
    ignored: 0,
    failed: 0,
  });
  removeChildDependencyMock.mockReset();
  removeChildDependencyMock.mockResolvedValue(undefined);
  onMock.mockReset();
  parseFileAssetMetadataMock.mockReset();
  processCoverForWorkMock.mockReset();
  quitMock.mockReset();
  queueConnectionConfigMock.mockClear();
  redisConstructorMock.mockClear();
  scanLibraryRootMock.mockReset();
  updateDataMock.mockReset();
  updateDataMock.mockResolvedValue(undefined);
  workFindUniqueMock.mockReset();
  externalLinkUpsertMock.mockReset();
  workerCloseMock.mockReset();
  workerConstructorMock.mockClear();
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
      enrichWork: enrichWorkMock,
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

    enrichWorkMock.mockResolvedValueOnce("enrich-result");
    await expect(
      processor(createMockJob({
        data: { workId: "work-1" },
        name: "refresh-metadata",
      }) as never),
    ).resolves.toBe("enrich-result");

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

  it("uses /data/covers as the production fallback when COVER_CACHE_DIR is unset", async () => {
    process.env.NODE_ENV = "production";

    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
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
      enrichWork: enrichWorkMock,
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

  it("updates ImportJob to RUNNING then SUCCEEDED when importJobId is present and no children", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
      attemptsMade: 1,
    }) as never);

    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "ij-1" },
      data: { status: "RUNNING", startedAt: expect.any(Date) as unknown, attemptsMade: 1 },
    });
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-1", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as unknown, scanStage: null, bullmqJobId: null },
    });
  });

  it("completes immediately when dependency counts omit unprocessed", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    getDependenciesCountMock.mockResolvedValueOnce({});

    await expect(processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-no-unprocessed" },
      name: "scan-library-root",
      attemptsMade: 1,
    }) as never)).resolves.toEqual({ missingFileAssetIds: [] });

    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-no-unprocessed", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as unknown, scanStage: null, bullmqJobId: null },
    });
  });

  it("waits for children when moveToWaitingChildren returns true", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    moveToWaitingChildrenMock.mockResolvedValueOnce(true);

    await expect(
      processor(
        createMockJob({
          data: { libraryRootId: "root-1", importJobId: "ij-wait" },
          name: "scan-library-root",
          attemptsMade: 0,
        }) as never,
        "lock-token-1",
      ),
    ).rejects.toThrow(FakeWaitingChildrenError);

    // RUNNING should be set but NOT SUCCEEDED
    expect(importJobUpdateMock).toHaveBeenCalledTimes(1);
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-wait" },
      data: { status: "RUNNING", startedAt: expect.any(Date) as unknown, attemptsMade: 0 },
    });

    // moveToWaitingChildren should be called with the token
    expect(moveToWaitingChildrenMock).toHaveBeenCalledWith("lock-token-1");
    // updateData should set step to waiting-children
    expect(updateDataMock).toHaveBeenCalledWith(
      expect.objectContaining({ step: "waiting-children" }),
    );
  });

  it("waits for children when unresolved dependencies remain even if moveToWaitingChildren returns false", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    moveToWaitingChildrenMock.mockResolvedValueOnce(false);
    getDependenciesCountMock.mockResolvedValueOnce({
      processed: 0,
      unprocessed: 1,
      ignored: 0,
      failed: 0,
    });

    await expect(
      processor(
        createMockJob({
          data: { libraryRootId: "root-1", importJobId: "ij-wait-deps" },
          name: "scan-library-root",
          attemptsMade: 0,
        }) as never,
        "lock-token-2",
      ),
    ).rejects.toThrow(FakeWaitingChildrenError);

    expect(importJobUpdateMock).toHaveBeenCalledTimes(1);
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-wait-deps" },
      data: { status: "RUNNING", startedAt: expect.any(Date) as unknown, attemptsMade: 0 },
    });
  });

  it("marks ImportJob SUCCEEDED and clears scanStage in completion phase (step=waiting-children)", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-complete", step: "waiting-children" },
      name: "scan-library-root",
      attemptsMade: 0,
    }) as never);

    // Should mark SUCCEEDED without dispatching the handler
    expect(scanLibraryRootMock).not.toHaveBeenCalled();
    expect(importJobUpdateMock).toHaveBeenCalledTimes(1);
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-complete", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as unknown, scanStage: null, bullmqJobId: null },
    });
  });

  it("returns without ImportJob update in completion phase when importJobId is absent", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await processor(createMockJob({
      data: { fileAssetId: "file-1", step: "waiting-children" },
      name: "hash-file-asset",
    }) as never);

    expect(hashFileAssetMock).not.toHaveBeenCalled();
    expect(importJobUpdateMock).not.toHaveBeenCalled();
  });

  it("does not mark the parent ImportJob SUCCEEDED when a child job completes its own waiting-children phase", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    await processor(createMockJob({
      data: { fileAssetId: "file-1", importJobId: "ij-child", step: "waiting-children" },
      name: "match-file-asset-to-edition",
    }) as never);

    expect(matchFileAssetToEditionMock).not.toHaveBeenCalled();
    expect(importJobUpdateMock).not.toHaveBeenCalled();
  });

  it("does not set RUNNING or update parent progress for child jobs with importJobId", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
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
      enrichWork: enrichWorkMock,
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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockRejectedValueOnce(new Error("Disk full"));

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-2" },
        name: "scan-library-root",
        attemptsMade: 2,
      }) as never),
    ).rejects.toThrow("Disk full");

    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-2" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date) as unknown,
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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockRejectedValueOnce("plain string error");

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-3" },
        name: "scan-library-root",
        attemptsMade: 1,
      }) as never),
    ).rejects.toBe("plain string error");

    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-3" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date) as unknown,
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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      attemptsMade: 0,
    }) as never);

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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    const updateProgressMock = vi.fn();
    scanLibraryRootMock.mockImplementationOnce(async (input: { reportProgress?: (data: unknown) => Promise<void> }) => {
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
    }) as never);

    // importJob.update should have been called: RUNNING, progress(totalFiles), progress(processedFiles), SUCCEEDED
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-progress" },
      data: { totalFiles: 100 },
    });
    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-progress" },
      data: { processedFiles: 50, errorCount: 1 },
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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    importJobUpdateMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("progress db down"))
      .mockResolvedValueOnce({
        status: "SUCCEEDED",
        finishedAt: new Date(),
        scanStage: null,
      });

    scanLibraryRootMock.mockImplementationOnce(async (input: { reportProgress?: (data: unknown) => Promise<void> }) => {
      await input.reportProgress?.({ processedFiles: 50, errorCount: 1, scanStage: "PROCESSING" });
      return { missingFileAssetIds: [] };
    });

    await expect(
      processor(createMockJob({
        data: { libraryRootId: "root-1", importJobId: "ij-progress-fail" },
        name: "scan-library-root",
        attemptsMade: 0,
      }) as never),
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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      attemptsMade: 0,
    }) as never);

    // scanLibraryRoot should be called WITHOUT reportProgress
    expect(scanLibraryRootMock).toHaveBeenCalledWith({ libraryRootId: "root-1" });
  });

  it("dispatches refresh-metadata jobs to enrichWork handler and wires deps", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    enrichWorkMock.mockResolvedValueOnce({ status: "enriched", workOlid: "OL123W" });

    const result = await processor(createMockJob({
      data: { workId: "work-1" },
      name: "refresh-metadata",
    }) as never);

    expect(result).toEqual({ status: "enriched", workOlid: "OL123W" });
    expect(enrichWorkMock).toHaveBeenCalledWith("work-1", expect.objectContaining({
      findWork: expect.any(Function) as unknown,
      searchOL: expect.any(Function) as unknown,
      getOLWork: expect.any(Function) as unknown,
      upsertExternalLink: expect.any(Function) as unknown,
      checkRateLimit: expect.any(Function) as unknown,
    }));

    // Exercise the deps callbacks for coverage
    const deps = (enrichWorkMock.mock.calls[0] as unknown[])[1] as {
      findWork: (id: string) => unknown;
      searchOL: (title: string, author: string) => unknown;
      getOLWork: (olid: string) => unknown;
      upsertExternalLink: (data: { editionId: string; provider: string; externalId: string; metadata: Record<string, unknown> }) => unknown;
      checkRateLimit: () => unknown;
    };

    workFindUniqueMock.mockResolvedValueOnce({ id: "w1" });
    await deps.findWork("w1");
    expect(workFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      include: {
        editions: {
          include: {
            contributors: { include: { contributor: true } },
            externalLinks: true,
          },
        },
      },
    });

    deps.searchOL("title", "author");
    deps.getOLWork("OL1W");

    externalLinkUpsertMock.mockResolvedValueOnce({ id: "el1" });
    await deps.upsertExternalLink({
      editionId: "e1",
      provider: "openlibrary",
      externalId: "OL1W",
      metadata: { title: "Test" },
    });
    expect(externalLinkUpsertMock).toHaveBeenCalledWith({
      where: {
        editionId_provider_externalId: {
          editionId: "e1",
          provider: "openlibrary",
          externalId: "OL1W",
        },
      },
      create: {
        editionId: "e1",
        provider: "openlibrary",
        externalId: "OL1W",
        metadata: { title: "Test" },
        lastSyncedAt: expect.any(Date) as unknown,
      },
      update: {
        metadata: { title: "Test" },
        lastSyncedAt: expect.any(Date) as unknown,
      },
    });

    const rateResult = deps.checkRateLimit();
    expect(rateResult).toEqual({ allowed: true });
  });

  it("fails unknown jobs", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
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
    }) as never);

    expect(createIngestServicesMock).toHaveBeenCalledTimes(1);
    const createArgs = createIngestServicesMock.mock.calls[0] as [{ enqueueLibraryJob: unknown }];
    expect(createArgs[0]).toHaveProperty("enqueueLibraryJob");
  });

  it("wrapped enqueue passes parent without removeDependencyOnFailure to enqueueLibraryJob", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const { enqueueLibraryJob: enqueueLibraryJobMock } = await import("@bookhouse/shared");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      id: "scan-job-42",
      queueQualifiedName: "bull:library",
    }) as never);

    // Get the wrapped enqueue from the createIngestServices call
    const createArgs = createIngestServicesMock.mock.calls[0] as [{ enqueueLibraryJob: (name: string, payload: unknown) => Promise<void> }];
    const wrappedEnqueue = createArgs[0].enqueueLibraryJob;

    // Call the wrapped enqueue and verify it adds parent options
    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1" },
      {
        parent: { id: "scan-job-42", queue: "bull:library" },
      },
    );
  });

  it("wrapped enqueue falls back to empty string when job.id is undefined", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const { enqueueLibraryJob: enqueueLibraryJobMock } = await import("@bookhouse/shared");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      id: undefined,
      queueQualifiedName: "bull:library",
    }) as never);

    const createArgs = createIngestServicesMock.mock.calls[0] as [{ enqueueLibraryJob: (name: string, payload: unknown) => Promise<void> }];
    const wrappedEnqueue = createArgs[0].enqueueLibraryJob;

    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1" },
      {
        parent: { id: "", queue: "bull:library" },
      },
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
    }) as never);

    const createArgs = createIngestServicesMock.mock.calls[0] as [{ enqueueLibraryJob: (name: string, payload: unknown) => Promise<void> }];
    const wrappedEnqueue = createArgs[0].enqueueLibraryJob;

    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1", importJobId: "ij-42" },
      {
        parent: { id: "scan-job-42", queue: "bull:library" },
      },
    );
  });

  it("wrapped enqueue does not inject importJobId when parent lacks it", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const { enqueueLibraryJob: enqueueLibraryJobMock } = await import("@bookhouse/shared");
    const processor = createLibraryWorkerProcessor();

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      id: "scan-job-42",
      queueQualifiedName: "bull:library",
    }) as never);

    const createArgs = createIngestServicesMock.mock.calls[0] as [{ enqueueLibraryJob: (name: string, payload: unknown) => Promise<void> }];
    const wrappedEnqueue = createArgs[0].enqueueLibraryJob;

    await wrappedEnqueue("hash-file-asset", { fileAssetId: "file-1" });

    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      "hash-file-asset",
      { fileAssetId: "file-1" },
      {
        parent: { id: "scan-job-42", queue: "bull:library" },
      },
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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-new" },
      name: "scan-library-root",
    }) as never);

    expect(importJobUpdateManyMock).toHaveBeenCalledWith({
      where: {
        libraryRootId: "root-1",
        status: { in: ["QUEUED", "RUNNING"] },
        id: { not: "ij-new" },
      },
      data: {
        status: "FAILED",
        error: "Superseded by new scan",
        finishedAt: expect.any(Date) as unknown,
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
      enrichWork: enrichWorkMock,
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
    }) as never);

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
      enrichWork: enrichWorkMock,
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
    }) as never);

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
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });
    cascadeCleanupOrphansMock.mockClear();
    await processor(createMockJob({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
    }) as never);

    expect(cascadeCleanupOrphansMock).not.toHaveBeenCalled();
  });

  it("calls moveToWaitingChildren and updateData after dispatch", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce({ missingFileAssetIds: [] });

    await processor(
      createMockJob({
        data: { libraryRootId: "root-1" },
        name: "scan-library-root",
      }) as never,
      "my-token",
    );

    expect(updateDataMock).toHaveBeenCalledWith({
      libraryRootId: "root-1",
      step: "waiting-children",
    });
    expect(moveToWaitingChildrenMock).toHaveBeenCalledWith("my-token");
  });

  it("marks the parent scan FAILED when a child job exhausts retries", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockRejectedValueOnce(new Error("hash failed"));

    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1", importJobId: "ij-child-fail" },
        opts: { attempts: 1 },
        name: "hash-file-asset",
        parentKey: "bull:library:parent-final",
      }) as never),
    ).rejects.toThrow("hash failed");

    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-child-fail", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Child job hash-file-asset failed: hash failed",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(removeChildDependencyMock).toHaveBeenCalledTimes(1);
  });

  it("records String(error) for final child job failures when opts are missing", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchSuggestions: matchSuggestionsMock,
    });

    hashFileAssetMock.mockRejectedValueOnce("plain child failure");

    await expect(
      processor(createMockJob({
        data: { fileAssetId: "file-1", importJobId: "ij-child-string-fail" },
        name: "hash-file-asset",
        opts: {},
        parentKey: "bull:library:parent-string",
      }) as never),
    ).rejects.toBe("plain child failure");

    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-child-string-fail", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Child job hash-file-asset failed: plain child failure",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
  });

  it("does not remove a parent dependency when a final child failure has no parentKey", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
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

    expect(importJobUpdateMock).toHaveBeenCalledWith({
      where: { id: "ij-child-no-parent", status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Child job hash-file-asset failed: hash failed",
        finishedAt: expect.any(Date) as unknown,
        scanStage: null,
        bullmqJobId: null,
      },
    });
    expect(removeChildDependencyMock).not.toHaveBeenCalled();
  });

  it("does not remove a parent dependency for non-final child failures", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
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
        parentKey: "bull:library:parent-1",
      }) as never),
    ).rejects.toThrow("transient");

    expect(importJobUpdateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "ij-child-retry" }) as unknown,
    }));
    expect(removeChildDependencyMock).not.toHaveBeenCalled();
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
        connection: expect.any(Object) as unknown,
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(processExitSpy).toHaveBeenCalledWith(0);

    // Invoke event callbacks to cover their bodies
    const readyCallback = onMock.mock.calls.find(([e]) => e === "ready")?.[1] as () => void;
    readyCallback();

    const completedCallback = onMock.mock.calls.find(([e]) => e === "completed")?.[1] as (job: unknown) => void;
    completedCallback({ id: "job-1", name: "scan-library-root" });

    const failedCallback = onMock.mock.calls.find(([e]) => e === "failed")?.[1] as (job: unknown, err: Error) => void;
    failedCallback({ id: "job-1", name: "scan-library-root" }, new Error("disk full"));
    failedCallback(undefined, new Error("no job ref"));

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("polls DB for concurrency and updates worker", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockResolvedValue({ key: "workerConcurrency", value: "10" });
    const { createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    // Advance past the poll interval (10s)
    await vi.advanceTimersByTimeAsync(10_000);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "workerConcurrency" } });
    expect(created.worker.concurrency).toBe(10);

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("uses default concurrency when no setting exists in DB", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockResolvedValue(null);
    const { createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    await vi.advanceTimersByTimeAsync(10_000);

    // Should stay at default (5)
    expect(created.worker.concurrency).toBe(5);

    await shutdownLibraryWorker(created.worker, created.connection, created.pollInterval);
    vi.useRealTimers();
  });

  it("shuts down cleanly without pollInterval", async () => {
    const { shutdownLibraryWorker } = await import("./index");

    await shutdownLibraryWorker({ close: workerCloseMock }, { quit: quitMock } as never);

    expect(workerCloseMock).toHaveBeenCalled();
    expect(quitMock).toHaveBeenCalled();
  });

  it("keeps current concurrency when DB is unavailable", async () => {
    vi.useFakeTimers();
    appSettingFindUniqueMock.mockRejectedValue(new Error("DB down"));
    const { createLibraryWorker, shutdownLibraryWorker } = await import("./index");
    const created = createLibraryWorker();

    await vi.advanceTimersByTimeAsync(10_000);

    // Should still be default concurrency
    expect(created.worker.concurrency).toBe(5);

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
