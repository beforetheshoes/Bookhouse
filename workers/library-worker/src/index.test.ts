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
const hashFileAssetMock = vi.fn();
const matchFileAssetToEditionMock = vi.fn();
const parseFileAssetMetadataMock = vi.fn();
const processCoverForWorkMock = vi.fn();
const scanLibraryRootMock = vi.fn();
const enrichWorkMock = vi.fn();
const detectDuplicatesMock = vi.fn();
const matchAudioMock = vi.fn();
const importJobUpdateMock = vi.fn();

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(config: unknown) {
      redisConstructorMock(config);
    }

    quit = quitMock;
  },
}));

vi.mock("bullmq", () => ({
  Worker: class FakeWorker {
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
}));

const workFindUniqueMock = vi.fn();
const externalLinkUpsertMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      update: importJobUpdateMock,
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
  hashFileAsset: hashFileAssetMock,
  matchFileAssetToEdition: matchFileAssetToEditionMock,
  parseFileAssetMetadata: parseFileAssetMetadataMock,
  processCoverForWorkDefault: () => processCoverForWorkMock,
  scanLibraryRoot: scanLibraryRootMock,
  enrichWork: enrichWorkMock,
  detectDuplicates: detectDuplicatesMock,
  matchAudio: matchAudioMock,
  searchOpenLibrary: vi.fn(),
  getOpenLibraryWork: vi.fn(),
  RateLimiter: class { check = () => ({ allowed: true }); },
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>(
    "@bookhouse/shared",
  );

  return {
    ...(actual as Record<string, unknown>),
    getQueueConnectionConfig: queueConnectionConfigMock,
  };
});

beforeEach(() => {
  addMock.mockReset();
  detectDuplicatesMock.mockReset();
  matchAudioMock.mockReset();
  enrichWorkMock.mockReset();
  hashFileAssetMock.mockReset();
  importJobUpdateMock.mockReset();
  importJobUpdateMock.mockResolvedValue({});
  matchFileAssetToEditionMock.mockReset();
  onMock.mockReset();
  parseFileAssetMetadataMock.mockReset();
  processCoverForWorkMock.mockReset();
  quitMock.mockReset();
  queueConnectionConfigMock.mockClear();
  redisConstructorMock.mockClear();
  scanLibraryRootMock.mockReset();
  workFindUniqueMock.mockReset();
  externalLinkUpsertMock.mockReset();
  workerCloseMock.mockReset();
  workerConstructorMock.mockClear();
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
      matchAudio: matchAudioMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce("scan-result");
    hashFileAssetMock.mockResolvedValueOnce("hash-result");
    matchFileAssetToEditionMock.mockResolvedValueOnce("match-result");
    parseFileAssetMetadataMock.mockResolvedValueOnce("parse-result");
    processCoverForWorkMock.mockResolvedValueOnce("cover-result");

    await expect(
      processor({
        data: { libraryRootId: "root-1" },
        name: "scan-library-root",
      } as never),
    ).resolves.toBe("scan-result");
    await expect(
      processor({
        data: { fileAssetId: "file-1" },
        name: "hash-file-asset",
      } as never),
    ).resolves.toBe("hash-result");
    await expect(
      processor({
        data: { fileAssetId: "file-1" },
        name: "match-file-asset-to-edition",
      } as never),
    ).resolves.toBe("match-result");
    await expect(
      processor({
        data: { fileAssetId: "file-1" },
        name: "parse-file-asset-metadata",
      } as never),
    ).resolves.toBe("parse-result");
    await expect(
      processor({
        data: { workId: "work-1", fileAssetId: "file-1" },
        name: "process-cover",
      } as never),
    ).resolves.toBe("cover-result");

    enrichWorkMock.mockResolvedValueOnce("enrich-result");
    await expect(
      processor({
        data: { workId: "work-1" },
        name: "refresh-metadata",
      } as never),
    ).resolves.toBe("enrich-result");

    detectDuplicatesMock.mockResolvedValueOnce("detect-result");
    await expect(
      processor({
        data: { fileAssetId: "file-1" },
        name: "detect-duplicates",
      } as never),
    ).resolves.toBe("detect-result");

    matchAudioMock.mockResolvedValueOnce("match-audio-result");
    await expect(
      processor({
        data: { fileAssetId: "file-1" },
        name: "match-audio",
      } as never),
    ).resolves.toBe("match-audio-result");

    expect(matchAudioMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(detectDuplicatesMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(scanLibraryRootMock).toHaveBeenCalledWith({ libraryRootId: "root-1" });
    expect(hashFileAssetMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(matchFileAssetToEditionMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(parseFileAssetMetadataMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(processCoverForWorkMock).toHaveBeenCalledWith({
      workId: "work-1",
      fileAssetId: "file-1",
      coverCacheDir: "/data/covers",
    });
  });

  it("updates ImportJob to RUNNING then SUCCEEDED when importJobId is present", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      processCoverForWork: processCoverForWorkMock,
      scanLibraryRoot: scanLibraryRootMock,
      enrichWork: enrichWorkMock,
      detectDuplicates: detectDuplicatesMock,
      matchAudio: matchAudioMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce("scan-result");

    await processor({
      data: { libraryRootId: "root-1", importJobId: "ij-1" },
      name: "scan-library-root",
      attemptsMade: 1,
    } as never);

    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "ij-1" },
      data: { status: "RUNNING", startedAt: expect.any(Date) as unknown, attemptsMade: 1 },
    });
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-1" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as unknown },
    });
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
      matchAudio: matchAudioMock,
    });

    scanLibraryRootMock.mockRejectedValueOnce(new Error("Disk full"));

    await expect(
      processor({
        data: { libraryRootId: "root-1", importJobId: "ij-2" },
        name: "scan-library-root",
        attemptsMade: 2,
      } as never),
    ).rejects.toThrow("Disk full");

    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-2" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date) as unknown,
        error: "Disk full",
        attemptsMade: 2,
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
      matchAudio: matchAudioMock,
    });

    scanLibraryRootMock.mockRejectedValueOnce("plain string error");

    await expect(
      processor({
        data: { libraryRootId: "root-1", importJobId: "ij-3" },
        name: "scan-library-root",
        attemptsMade: 1,
      } as never),
    ).rejects.toBe("plain string error");

    expect(importJobUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-3" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date) as unknown,
        error: "plain string error",
        attemptsMade: 1,
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
      matchAudio: matchAudioMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce("scan-result");

    await processor({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      attemptsMade: 0,
    } as never);

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
      matchAudio: matchAudioMock,
    });

    const updateProgressMock = vi.fn();
    scanLibraryRootMock.mockImplementationOnce(async (input: { reportProgress?: (data: unknown) => Promise<void> }) => {
      if (input.reportProgress) {
        await input.reportProgress({ totalFiles: 100 });
        await input.reportProgress({ processedFiles: 50, errorCount: 1 });
      }
      return "scan-result";
    });

    await processor({
      data: { libraryRootId: "root-1", importJobId: "ij-progress" },
      name: "scan-library-root",
      attemptsMade: 0,
      updateProgress: updateProgressMock,
    } as never);

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
      matchAudio: matchAudioMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce("scan-result");

    await processor({
      data: { libraryRootId: "root-1" },
      name: "scan-library-root",
      attemptsMade: 0,
    } as never);

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
      matchAudio: matchAudioMock,
    });

    enrichWorkMock.mockResolvedValueOnce({ status: "enriched", workOlid: "OL123W" });

    const result = await processor({
      data: { workId: "work-1" },
      name: "refresh-metadata",
    } as never);

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
      matchAudio: matchAudioMock,
    });

    await expect(
      processor({
        data: {},
        name: "unknown-job",
      } as never),
    ).rejects.toThrow("Unsupported library job: unknown-job");
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
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    await shutdownLibraryWorker(created.worker, created.connection);

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
