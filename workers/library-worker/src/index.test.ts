import { beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.fn();
const onMock = vi.fn();
const workerCloseMock = vi.fn(async () => undefined);
const workerConstructorMock = vi.fn();
const queueConnectionConfigMock = vi.fn(() => ({ host: "localhost", port: 6379 }));
const quitMock = vi.fn(async () => "OK");
const redisConstructorMock = vi.fn();
const hashFileAssetMock = vi.fn();
const matchFileAssetToEditionMock = vi.fn();
const parseFileAssetMetadataMock = vi.fn();
const scanLibraryRootMock = vi.fn();

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
  Job: class {},
  Queue: class {
    add = addMock;
  },
}));

vi.mock("@bookhouse/ingest", () => ({
  hashFileAsset: hashFileAssetMock,
  matchFileAssetToEdition: matchFileAssetToEditionMock,
  parseFileAssetMetadata: parseFileAssetMetadataMock,
  scanLibraryRoot: scanLibraryRootMock,
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof import("@bookhouse/shared")>(
    "@bookhouse/shared",
  );

  return {
    ...actual,
    getQueueConnectionConfig: queueConnectionConfigMock,
  };
});

beforeEach(() => {
  addMock.mockReset();
  hashFileAssetMock.mockReset();
  matchFileAssetToEditionMock.mockReset();
  onMock.mockReset();
  parseFileAssetMetadataMock.mockReset();
  quitMock.mockReset();
  queueConnectionConfigMock.mockClear();
  redisConstructorMock.mockClear();
  scanLibraryRootMock.mockReset();
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
      scanLibraryRoot: scanLibraryRootMock,
    });

    scanLibraryRootMock.mockResolvedValueOnce("scan-result");
    hashFileAssetMock.mockResolvedValueOnce("hash-result");
    matchFileAssetToEditionMock.mockResolvedValueOnce("match-result");
    parseFileAssetMetadataMock.mockResolvedValueOnce("parse-result");

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

    expect(scanLibraryRootMock).toHaveBeenCalledWith({ libraryRootId: "root-1" });
    expect(hashFileAssetMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(matchFileAssetToEditionMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
    expect(parseFileAssetMetadataMock).toHaveBeenCalledWith({ fileAssetId: "file-1" });
  });

  it("fails unknown jobs", async () => {
    const { createLibraryWorkerProcessor } = await import("./index");
    const processor = createLibraryWorkerProcessor({
      hashFileAsset: hashFileAssetMock,
      matchFileAssetToEdition: matchFileAssetToEditionMock,
      parseFileAssetMetadata: parseFileAssetMetadataMock,
      scanLibraryRoot: scanLibraryRootMock,
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
      { connection: expect.any(Object) },
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

    await bootstrapLibraryWorker();

    expect(onMock).toHaveBeenCalledTimes(3);
    expect(onMock).toHaveBeenNthCalledWith(1, "ready", expect.any(Function));
    expect(onMock).toHaveBeenNthCalledWith(2, "completed", expect.any(Function));
    expect(onMock).toHaveBeenNthCalledWith(3, "failed", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    const shutdownHandler = processOnSpy.mock.calls.find(([event]) => event === "SIGINT")?.[1] as () => Promise<void>;
    await shutdownHandler();

    expect(processExitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("boots automatically when imported as the entrypoint script", async () => {
    vi.resetModules();
    const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    const originalArgv = [...process.argv];

    process.argv[1] = "/Users/ryan/Developer/Bookhouse/workers/library-worker/src/index.ts";

    await import("./index");

    expect(onMock).toHaveBeenCalledWith("ready", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));

    process.argv.splice(0, process.argv.length, ...originalArgv);
    processOnSpy.mockRestore();
  });
});
