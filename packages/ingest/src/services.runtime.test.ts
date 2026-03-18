import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueLibraryJobMock = vi.fn(async () => "job-1");

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
      findByDirectory: vi.fn(async () => []),
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
    contributor: {
      create: vi.fn(async () => {
        throw new Error("not used");
      }),
      findMany: vi.fn(async () => []),
    },
    edition: {
      create: vi.fn(async () => {
        throw new Error("not used");
      }),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
    editionContributor: {
      create: vi.fn(async () => {
        throw new Error("not used");
      }),
      findFirst: vi.fn(async () => null),
    },
    editionFile: {
      create: vi.fn(async () => {
        throw new Error("not used");
      }),
      findFirst: vi.fn(async () => null),
    },
    work: {
      create: vi.fn(async () => {
        throw new Error("not used");
      }),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
    series: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "series-1", name: "test" })),
    },
  },
}));

vi.mock("@bookhouse/domain", () => ({
  AvailabilityStatus: {
    MISSING: "MISSING",
    PRESENT: "PRESENT",
  },
  ContributorRole: {
    AUTHOR: "AUTHOR",
  },
  EditionFileRole: {
    PRIMARY: "PRIMARY",
  },
  FormatFamily: {
    EBOOK: "EBOOK",
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
    enqueueLibraryJob: enqueueLibraryJobMock,
  };
});

beforeEach(() => {
  enqueueLibraryJobMock.mockClear();
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
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("hash-file-asset", {
      fileAssetId: "file-1",
    });
  });
});
