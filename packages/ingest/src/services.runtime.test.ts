import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueLibraryJobMock = vi.fn(() => Promise.resolve("job-1"));

vi.mock("@bookhouse/db", () => ({
  db: {
    libraryRoot: {
      findUnique: vi.fn(() => Promise.resolve({
        id: "root-1",
        lastScannedAt: null,
        path: "/tmp/runtime-root",
      })),
      update: vi.fn(({ data }: { data: { lastScannedAt: Date } }) => Promise.resolve({
        id: "root-1",
        lastScannedAt: data.lastScannedAt,
        path: "/tmp/runtime-root",
      })),
    },
    fileAsset: {
      findByDirectory: vi.fn(() => Promise.resolve([])),
      findMany: vi.fn(() => Promise.resolve([])),
      upsert: vi.fn(() => Promise.resolve({
        absolutePath: "/tmp/runtime-root/book.epub",
        availabilityStatus: "PRESENT",
        fullHash: null,
        id: "file-1",
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: null,
        sizeBytes: 5n,
      })),
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.reject(new Error("not used"))),
    },
    contributor: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findMany: vi.fn(() => Promise.resolve([])),
    },
    edition: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findFirst: vi.fn(() => Promise.resolve(null)),
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.reject(new Error("not used"))),
    },
    editionContributor: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    editionFile: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    work: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.reject(new Error("not used"))),
    },
    series: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(() => Promise.resolve({ id: "series-1", name: "test" })),
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
  const actual = await vi.importActual("@bookhouse/shared");

  return {
    ...actual,
    enqueueLibraryJob: enqueueLibraryJobMock,
  };
});

beforeEach(() => {
  enqueueLibraryJobMock.mockClear();
});

describe("ingest runtime defaults", () => {
  it("default db adapter exercises findByDirectory, edition.update, work.update, and both series.upsert branches", async () => {
    vi.resetModules();
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("./services");

    vi.mocked(db.fileAsset.update).mockResolvedValue({} as Awaited<ReturnType<typeof db.fileAsset.update>>);

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
    vi.mocked(db.fileAsset.findUnique).mockResolvedValueOnce(opfAsset("file-opf-1", "/tmp/root/Book1/metadata.opf"));
    vi.mocked(db.fileAsset.findMany).mockResolvedValueOnce(epubSibling("file-epub-1", "/tmp/root/Book1/book.epub"));
    vi.mocked(db.editionFile.findFirst).mockResolvedValueOnce({ editionId: "edition-1", fileAssetId: "file-epub-1", id: "ef-1", role: "PRIMARY" } as never);
    vi.mocked(db.edition.findUnique).mockResolvedValueOnce({ id: "edition-1", publisher: null, publishedAt: null, workId: "work-1" } as never);
    vi.mocked(db.edition.update).mockResolvedValueOnce({} as never);
    vi.mocked(db.work.findUnique).mockResolvedValueOnce({ id: "work-1", description: null, language: null, seriesId: null } as never);
    vi.mocked(db.work.update).mockResolvedValueOnce({} as never);
    vi.mocked(db.series.findFirst).mockResolvedValueOnce(null);
    vi.mocked(db.series.create).mockResolvedValueOnce({ id: "series-1", name: "The Kingkiller Chronicle" } as never);

    const result1 = await services.parseFileAssetMetadata({ fileAssetId: "file-opf-1", now: new Date("2025-01-01T00:00:00.000Z") });
    expect(result1.availabilityStatus).toBe("PRESENT");
    expect(vi.mocked(db.fileAsset.findMany)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.edition.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.work.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.series.create)).toHaveBeenCalledTimes(1);

    // ── Second call: series.upsert "existing" path (findFirst → existing → return, no create) ──
    vi.mocked(db.fileAsset.findUnique).mockResolvedValueOnce(opfAsset("file-opf-2", "/tmp/root/Book2/metadata.opf"));
    vi.mocked(db.fileAsset.findMany).mockResolvedValueOnce(epubSibling("file-epub-2", "/tmp/root/Book2/book.epub"));
    vi.mocked(db.editionFile.findFirst).mockResolvedValueOnce({ editionId: "edition-2", fileAssetId: "file-epub-2", id: "ef-2", role: "PRIMARY" } as never);
    vi.mocked(db.edition.findUnique).mockResolvedValueOnce({ id: "edition-2", publisher: null, publishedAt: null, workId: "work-2" } as never);
    vi.mocked(db.edition.update).mockResolvedValueOnce({} as never);
    vi.mocked(db.work.findUnique).mockResolvedValueOnce({ id: "work-2", description: null, language: null, seriesId: null } as never);
    vi.mocked(db.work.update).mockResolvedValueOnce({} as never);
    vi.mocked(db.series.findFirst).mockResolvedValueOnce({ id: "series-1", name: "The Kingkiller Chronicle" } as never);

    const result2 = await services.parseFileAssetMetadata({ fileAssetId: "file-opf-2", now: new Date("2025-01-01T00:00:00.000Z") });
    expect(result2.availabilityStatus).toBe("PRESENT");
    // create should still be 1 (not called again — existing series was returned)
    expect(vi.mocked(db.series.create)).toHaveBeenCalledTimes(1);
  });

  it("uses the default queue enqueuer when no override is provided", async () => {
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

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });
    const secondResult = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedHashJobs).toEqual(["file-1"]);
    expect(secondResult.enqueuedHashJobs).toEqual(["file-1"]);
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("hash-file-asset", {
      fileAssetId: "file-1",
    });
  });
});
