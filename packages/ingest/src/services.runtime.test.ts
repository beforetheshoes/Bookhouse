import { beforeEach, describe, expect, it, vi } from "vitest";

type RuntimeLibraryRoot = {
  id: string;
  lastScannedAt: Date | null;
  path: string;
  scanMode: "FULL" | "INCREMENTAL";
};

const enqueueLibraryJobMock = vi.fn(() => Promise.resolve("job-1"));
const fileAssetFindManyMock = vi.fn(() => Promise.resolve([]));
const fileAssetUpdateManyMock = vi.fn(() => Promise.resolve({ count: 0 }));
const fileAssetUpsertMock = vi.fn(() => Promise.resolve({
  absolutePath: "/tmp/runtime-root/book.epub",
  availabilityStatus: "PRESENT",
  fullHash: null,
  id: "file-1",
  mtime: new Date("2025-01-01T00:00:00.000Z"),
  partialHash: null,
  sizeBytes: 5n,
}));
const editionFindManyMock = vi.fn(() => Promise.resolve([]));
const editionFileFindManyMock = vi.fn(() => Promise.resolve([]));
const editionUpdateMock = vi.fn(() => Promise.reject(new Error("not used")));
let runtimeLibraryRoot: RuntimeLibraryRoot = {
  id: "root-1",
  lastScannedAt: null,
  path: "/tmp/runtime-root",
  scanMode: "INCREMENTAL",
};
const libraryRootFindUniqueMock = vi.fn(() => Promise.resolve(runtimeLibraryRoot));
const workUpdateMock = vi.fn(() => Promise.reject(new Error("not used")));
const workFindManyMock = vi.fn(() => Promise.resolve([]));
const seriesCreateMock = vi.fn(() => Promise.resolve({ id: "series-1", name: "test" }));

vi.mock("@bookhouse/db", () => ({
  db: {
    libraryRoot: {
      findUnique: libraryRootFindUniqueMock,
      update: vi.fn(({ data }: { data: { lastScannedAt: Date; scanMode?: "FULL" | "INCREMENTAL" } }) => {
        runtimeLibraryRoot = {
          ...runtimeLibraryRoot,
          lastScannedAt: data.lastScannedAt,
          scanMode: data.scanMode ?? runtimeLibraryRoot.scanMode,
        };
        return Promise.resolve(runtimeLibraryRoot);
      }),
    },
    fileAsset: {
      findByDirectory: vi.fn(() => Promise.resolve([])),
      findMany: fileAssetFindManyMock,
      updateMany: fileAssetUpdateManyMock,
      upsert: fileAssetUpsertMock,
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.reject(new Error("not used"))),
    },
    contributor: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findMany: vi.fn(() => Promise.resolve([])),
    },
    edition: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findMany: editionFindManyMock,
      findFirst: vi.fn(() => Promise.resolve(null)),
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: editionUpdateMock,
    },
    editionContributor: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    editionFile: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findMany: editionFileFindManyMock,
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    work: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findMany: workFindManyMock,
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: workUpdateMock,
    },
    series: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      create: seriesCreateMock,
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
  ScanMode: {
    FULL: "FULL",
    INCREMENTAL: "INCREMENTAL",
  },
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual("@bookhouse/shared");

  return {
    ...actual,
    enqueueLibraryJob: enqueueLibraryJobMock,
  };
});

beforeEach(() => {
  runtimeLibraryRoot = {
    id: "root-1",
    lastScannedAt: null,
    path: "/tmp/runtime-root",
    scanMode: "INCREMENTAL",
  };
  enqueueLibraryJobMock.mockClear();
  editionFileFindManyMock.mockReset();
  editionFileFindManyMock.mockResolvedValue([]);
  editionFindManyMock.mockReset();
  editionFindManyMock.mockResolvedValue([]);
  fileAssetFindManyMock.mockReset();
  fileAssetFindManyMock.mockResolvedValue([]);
  fileAssetUpdateManyMock.mockReset();
  fileAssetUpdateManyMock.mockResolvedValue({ count: 0 });
  fileAssetUpsertMock.mockReset();
  fileAssetUpsertMock.mockResolvedValue({
    absolutePath: "/tmp/runtime-root/book.epub",
    availabilityStatus: "PRESENT",
    fullHash: null,
    id: "file-1",
    mtime: new Date("2025-01-01T00:00:00.000Z"),
    partialHash: null,
    sizeBytes: 5n,
  });
  libraryRootFindUniqueMock.mockReset();
  libraryRootFindUniqueMock.mockImplementation(() => Promise.resolve(runtimeLibraryRoot));
  workFindManyMock.mockReset();
  workFindManyMock.mockResolvedValue([]);
});

describe("ingest runtime defaults", () => {
  it("default db adapter exercises findByDirectory, edition.update, work.update, and both series.upsert branches", async () => {
    vi.resetModules();
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("./services");

    vi.mocked(db.fileAsset).update.mockResolvedValue({} as Awaited<ReturnType<typeof db.fileAsset.update>>);

    const opfAsset = (id: string, path: string) => ({
      absolutePath: path,
      availabilityStatus: "PRESENT",
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "h",
      id,
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: "SIDECAR",
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "p",
      relativePath: "metadata.opf",
      sizeBytes: 2n,
    } as never);

    const epubSibling = (id: string, path: string) => ([{
      absolutePath: path,
      availabilityStatus: "PRESENT",
      basename: "book.epub",
      extension: "epub",
      fullHash: "epub-h",
      id,
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: "EPUB",
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-p",
      relativePath: "book.epub",
      sizeBytes: 100n,
    }] as never);

    const parseOpf = vi.fn(() => Promise.resolve({
      authors: [],
      identifiers: [],
      subjects: [],
      publisher: "DAW Books",
      date: "2007-03-27",
      description: "A story.",
      language: "en",
      series: { name: "The Kingkiller Chronicle", index: 1 },
    }));

    const services = createIngestServices({ parseOpf });

    // ── First call: series.upsert "create" path (findFirst → null → create) ──
    vi.mocked(db.fileAsset).findUnique.mockResolvedValueOnce(opfAsset("file-opf-1", "/tmp/root/Book1/metadata.opf"));
    fileAssetFindManyMock.mockResolvedValueOnce(epubSibling("file-epub-1", "/tmp/root/Book1/book.epub"));
    vi.mocked(db.editionFile).findFirst.mockResolvedValueOnce({ editionId: "edition-1", fileAssetId: "file-epub-1", id: "ef-1", role: "PRIMARY" } as never);
    vi.mocked(db.edition).findUnique.mockResolvedValueOnce({ id: "edition-1", publisher: null, publishedAt: null, workId: "work-1" } as never);
    editionUpdateMock.mockResolvedValueOnce({} as never); // publisher/date update
    vi.mocked(db.work).findUnique.mockResolvedValueOnce({ id: "work-1", description: null, seriesId: null } as never);
    editionUpdateMock.mockResolvedValueOnce({} as never); // language update
    workUpdateMock.mockResolvedValueOnce({} as never);
    vi.mocked(db.series).findFirst.mockResolvedValueOnce(null);
    seriesCreateMock.mockResolvedValueOnce({ id: "series-1", name: "The Kingkiller Chronicle" } as never);

    const result1 = await services.parseFileAssetMetadata({ fileAssetId: "file-opf-1", now: new Date("2025-01-01T00:00:00.000Z") });
    expect(result1.availabilityStatus).toBe("PRESENT");
    expect(fileAssetFindManyMock).toHaveBeenCalledTimes(1);
    expect(editionUpdateMock).toHaveBeenCalledTimes(2);
    expect(workUpdateMock).toHaveBeenCalledTimes(1);
    expect(seriesCreateMock).toHaveBeenCalledTimes(1);

    // ── Second call: series.upsert "existing" path (findFirst → existing → return, no create) ──
    vi.mocked(db.fileAsset).findUnique.mockResolvedValueOnce(opfAsset("file-opf-2", "/tmp/root/Book2/metadata.opf"));
    fileAssetFindManyMock.mockResolvedValueOnce(epubSibling("file-epub-2", "/tmp/root/Book2/book.epub"));
    vi.mocked(db.editionFile).findFirst.mockResolvedValueOnce({ editionId: "edition-2", fileAssetId: "file-epub-2", id: "ef-2", role: "PRIMARY" } as never);
    vi.mocked(db.edition).findUnique.mockResolvedValueOnce({ id: "edition-2", publisher: null, publishedAt: null, workId: "work-2" } as never);
    editionUpdateMock.mockResolvedValueOnce({} as never); // publisher/date update
    vi.mocked(db.work).findUnique.mockResolvedValueOnce({ id: "work-2", description: null, seriesId: null } as never);
    editionUpdateMock.mockResolvedValueOnce({} as never); // language update
    workUpdateMock.mockResolvedValueOnce({} as never);
    vi.mocked(db.series).findFirst.mockResolvedValueOnce({ id: "series-1", name: "The Kingkiller Chronicle" } as never);

    const result2 = await services.parseFileAssetMetadata({ fileAssetId: "file-opf-2", now: new Date("2025-01-01T00:00:00.000Z") });
    expect(result2.availabilityStatus).toBe("PRESENT");
    // create should still be 1 (not called again — existing series was returned)
    expect(seriesCreateMock).toHaveBeenCalledTimes(1);
  });

  it("uses FULL once for a new root, then requires an explicit override for later full scans", async () => {
    vi.resetModules();
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({
      listDirectory: (() =>
        Promise.resolve([
          {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            name: "book.epub",
          },
        ] as never)),
      readStats: (() =>
        Promise.resolve({
          ctime: new Date("2025-01-01T00:00:00.000Z"),
          isFile: () => true,
          isSymbolicLink: () => false,
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          size: 5,
        } as never)),
    });

    runtimeLibraryRoot = {
      id: "root-1",
      lastScannedAt: null,
      path: "/tmp/runtime-root",
      scanMode: "FULL",
    };
    fileAssetFindManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        absolutePath: "/tmp/runtime-root/book.epub",
        availabilityStatus: "PRESENT",
        basename: "book.epub",
        ctime: new Date("2025-01-01T00:00:00.000Z"),
        extension: "epub",
        fullHash: "full",
        id: "file-1",
        lastSeenAt: new Date("2025-01-01T00:00:00.000Z"),
        libraryRootId: "root-1",
        mediaKind: "EPUB",
        metadata: null,
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: "partial",
        relativePath: "book.epub",
        sizeBytes: 5n,
      }] as never);
    fileAssetUpsertMock.mockResolvedValue({
      absolutePath: "/tmp/runtime-root/book.epub",
      availabilityStatus: "PRESENT",
      fullHash: "full",
      id: "file-1",
      mtime: new Date("2025-01-01T00:00:00.000Z"),
      partialHash: "partial",
      sizeBytes: 5n,
    } as never);

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });
    const secondResult = await services.scanLibraryRoot({ libraryRootId: "root-1" });
    const thirdResult = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      scanMode: "FULL",
    });

    expect(result.enqueuedHashJobs).toEqual(["file-1"]);
    expect(secondResult.enqueuedHashJobs).toEqual([]);
    expect(thirdResult.enqueuedHashJobs).toEqual(["file-1"]);
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("hash-file-asset", {
      fileAssetId: "file-1",
    });
  });

  it("uses the default adapter bulk update for unchanged incremental files", async () => {
    vi.resetModules();
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({
      listDirectory: (() =>
        Promise.resolve([
          {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            name: "book.epub",
          },
        ] as never)),
      readStats: (() =>
        Promise.resolve({
          ctime: new Date("2025-01-01T00:00:00.000Z"),
          isFile: () => true,
          isSymbolicLink: () => false,
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          size: 5,
        } as never)),
    });

    const unchangedAsset = {
      absolutePath: "/tmp/runtime-root/book.epub",
      availabilityStatus: "PRESENT",
      basename: "book.epub",
      ctime: new Date("2025-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: new Date("2024-12-31T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: "EPUB",
      metadata: null,
      mtime: new Date("2025-01-01T00:00:00.000Z"),
      partialHash: "partial",
      relativePath: "book.epub",
      sizeBytes: 5n,
    };

    runtimeLibraryRoot = {
      id: "root-1",
      lastScannedAt: null,
      path: "/tmp/runtime-root",
      scanMode: "INCREMENTAL",
    };
    fileAssetFindManyMock.mockResolvedValue([unchangedAsset] as never);

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(result.enqueuedHashJobs).toEqual([]);
    expect(fileAssetUpsertMock).not.toHaveBeenCalled();
    expect(fileAssetUpdateManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["file-1"] } },
      data: { lastSeenAt: new Date("2025-01-01T00:10:00.000Z") },
    });
  });

  it("uses default adapter preload queries for unchanged recovery paths", async () => {
    vi.resetModules();
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({
      listDirectory: (() =>
        Promise.resolve([
          {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            name: "book.epub",
          },
        ] as never)),
      readStats: (() =>
        Promise.resolve({
          ctime: new Date("2025-01-01T00:00:00.000Z"),
          isFile: () => true,
          isSymbolicLink: () => false,
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          size: 5,
        } as never)),
    });

    fileAssetFindManyMock.mockResolvedValue([{
      absolutePath: "/tmp/runtime-root/book.epub",
      availabilityStatus: "PRESENT",
      basename: "book.epub",
      ctime: new Date("2025-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: new Date("2024-12-31T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: "EPUB",
      metadata: null,
      mtime: new Date("2025-01-01T00:00:00.000Z"),
      partialHash: "partial",
      relativePath: "book.epub",
      sizeBytes: 5n,
    }] as never);
    editionFileFindManyMock.mockResolvedValue([{ editionId: "edition-1", fileAssetId: "file-1", id: "ef-1", role: "PRIMARY" }] as never);
    editionFindManyMock.mockResolvedValue([{ formatFamily: "EBOOK", id: "edition-1", workId: "work-1", asin: null, isbn10: null, isbn13: null, language: null, publishedAt: null, publisher: null }] as never);
    workFindManyMock.mockResolvedValue([{ coverPath: null, description: null, enrichmentStatus: "STUB", id: "work-1", seriesId: null, seriesPosition: null, sortTitle: null, titleCanonical: "book", titleDisplay: "Book" }] as never);

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(result.enqueuedHashJobs).toEqual([]);
    expect(result.enqueuedRecoveryJobs).toEqual(["file-1"]);
    expect(editionFileFindManyMock).toHaveBeenCalledWith({
      where: { fileAssetId: { in: ["file-1"] } },
    });
    expect(workFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["work-1"] } },
    });
    expect(editionFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["edition-1"] } },
    });
  });
});
