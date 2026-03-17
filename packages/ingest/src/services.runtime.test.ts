import { beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.fn(async () => undefined);
const queueConstructorMock = vi.fn();
const redisConstructorMock = vi.fn();

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(config: unknown) {
      redisConstructorMock(config);
    }
  },
}));

vi.mock("bullmq", () => ({
  Queue: class FakeQueue {
    constructor(...args: unknown[]) {
      queueConstructorMock(...args);
    }

    add = addMock;
  },
}));

vi.mock("@bookhouse/db", () => ({
  db: {
    libraryRoot: {
      findUnique: vi.fn(async () => ({
        id: "root-1",
        lastScannedAt: null,
        path: "/tmp/runtime-root",
      })),
      update: vi.fn(async ({ data }: { data: { lastScannedAt: Date } }) => ({
        id: "root-1",
        lastScannedAt: data.lastScannedAt,
        path: "/tmp/runtime-root",
      })),
    },
    fileAsset: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({
        absolutePath: "/tmp/runtime-root/book.epub",
        availabilityStatus: "PRESENT",
        fullHash: null,
        id: "file-1",
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: null,
        sizeBytes: 5n,
      })),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
  },
}));

vi.mock("@bookhouse/domain", () => ({
  AvailabilityStatus: {
    MISSING: "MISSING",
    PRESENT: "PRESENT",
  },
  MediaKind: {
    AUDIO: "AUDIO",
    CBZ: "CBZ",
    COVER: "COVER",
    EPUB: "EPUB",
    OTHER: "OTHER",
    PDF: "PDF",
    SIDECAR: "SIDECAR",
  },
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof import("@bookhouse/shared")>(
    "@bookhouse/shared",
  );

  return {
    ...actual,
    getQueueConnectionConfig: () => ({ host: "localhost", port: 6379 }),
  };
});

beforeEach(() => {
  addMock.mockClear();
  queueConstructorMock.mockClear();
  redisConstructorMock.mockClear();
});

describe("ingest runtime defaults", () => {
  it("uses the default queue enqueuer when no override is provided", async () => {
    vi.resetModules();
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({
      listDirectory: (async () =>
        [
          {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            name: "book.epub",
          },
        ] as never),
      readStats: (async () =>
        ({
          ctime: new Date("2025-01-01T00:00:00.000Z"),
          isFile: () => true,
          isSymbolicLink: () => false,
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          size: 5,
        }) as never),
    });

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });
    const secondResult = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedHashJobs).toEqual(["file-1"]);
    expect(secondResult.enqueuedHashJobs).toEqual(["file-1"]);
    expect(redisConstructorMock).toHaveBeenCalledWith({ host: "localhost", port: 6379 });
    expect(redisConstructorMock).toHaveBeenCalledTimes(1);
    expect(queueConstructorMock).toHaveBeenCalledWith("library", {
      connection: expect.any(Object),
    });
    expect(addMock).toHaveBeenCalledWith("hash-file-asset", {
      fileAssetId: "file-1",
    });
  });
});
