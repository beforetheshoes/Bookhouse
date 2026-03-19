import { beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.fn();
const redisConstructorMock = vi.fn();

vi.mock("ioredis", () => ({
  default: function FakeRedis(config: unknown) {
    redisConstructorMock(config);
  },
}));

vi.mock("bullmq", () => ({
  Queue: class FakeQueue {
    add = addMock;
  },
}));

beforeEach(() => {
  vi.resetModules();
  addMock.mockReset();
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
      { attempts: config.attempts, backoff: config.backoff },
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
      { attempts: config.attempts, backoff: config.backoff },
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
      { attempts: config.attempts, backoff: config.backoff },
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
      { attempts: config.attempts, backoff: config.backoff },
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
