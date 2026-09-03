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
const editionCreateMock = vi.fn(({ data }) => Promise.resolve({ id: "edition-1", ...data }));
const editionFileCreateMock = vi.fn(({ data }) => Promise.resolve({ id: "edition-file-1", ...data }));
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
const workCreateMock = vi.fn(({ data }) => Promise.resolve({ id: "work-1", ...data }));
const seriesUpsertMock = vi.fn(() => Promise.resolve({ id: "series-1", name: "test" }));
const editionFileUpdateMock = vi.fn(({ data }: { data: { fileAssetId: string } }) =>
  Promise.resolve({ id: "ef", ...data }));
const workDeleteMock = vi.fn(() => Promise.resolve(undefined));
const workDeleteManyMock = vi.fn(() => Promise.resolve({ count: 1 }));
const transactionMock = vi.fn(() => Promise.resolve([]));
const workTagFindManyMock = vi.fn(() => Promise.resolve([]));
const workTagCreateManyMock = vi.fn(() => Promise.resolve({ count: 0 }));
const externalLinkFindManyMock = vi.fn(() => Promise.resolve([]));
const externalLinkDeleteManyMock = vi.fn(() => Promise.resolve({ count: 0 }));
const externalLinkUpdateManyMock = vi.fn(() => Promise.resolve({ count: 0 }));
const preferenceFindManyMock = vi.fn(() => Promise.resolve([]));
const preferenceDeleteManyMock = vi.fn(() => Promise.resolve({ count: 0 }));
const preferenceUpdateManyMock = vi.fn(() => Promise.resolve({ count: 0 }));
const editionUpdateManyMock = vi.fn(() => Promise.resolve({ count: 0 }));

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
      create: editionCreateMock,
      findMany: editionFindManyMock,
      findFirst: vi.fn(() => Promise.resolve(null)),
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: editionUpdateMock,
      updateMany: editionUpdateManyMock,
    },
    editionContributor: {
      create: vi.fn(() => Promise.reject(new Error("not used"))),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    editionFile: {
      create: editionFileCreateMock,
      findMany: editionFileFindManyMock,
      findFirst: vi.fn(() => Promise.resolve(null)),
      update: editionFileUpdateMock,
    },
    work: {
      create: workCreateMock,
      findMany: workFindManyMock,
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: workUpdateMock,
      delete: workDeleteMock,
      deleteMany: workDeleteManyMock,
    },
    series: {
      upsert: seriesUpsertMock,
    },
    workTag: { findMany: workTagFindManyMock, createMany: workTagCreateManyMock },
    externalLink: {
      findMany: externalLinkFindManyMock,
      deleteMany: externalLinkDeleteManyMock,
      updateMany: externalLinkUpdateManyMock,
    },
    workProgressPreference: {
      findMany: preferenceFindManyMock,
      deleteMany: preferenceDeleteManyMock,
      updateMany: preferenceUpdateManyMock,
    },
    $transaction: transactionMock,
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
    ALTERNATE_FORMAT: "ALTERNATE_FORMAT",
    PRIMARY: "PRIMARY",
  },
  FormatFamily: {
    EBOOK: "EBOOK",
  },
  MediaKind: {
    AUDIO: "AUDIO",
    AZW: "AZW",
    AZW3: "AZW3",
    CBZ: "CBZ",
    COVER: "COVER",
    EPUB: "EPUB",
    MOBI: "MOBI",
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
  editionCreateMock.mockClear();
  editionFileCreateMock.mockClear();
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
  workCreateMock.mockClear();
  workFindManyMock.mockReset();
  workFindManyMock.mockResolvedValue([]);
  editionFileUpdateMock.mockClear();
  workDeleteMock.mockClear();
  transactionMock.mockClear();
  for (const mock of [
    workTagFindManyMock, workTagCreateManyMock, externalLinkFindManyMock, externalLinkDeleteManyMock,
    externalLinkUpdateManyMock, preferenceFindManyMock, preferenceDeleteManyMock, preferenceUpdateManyMock,
    editionUpdateManyMock, workUpdateMock,
  ]) {
    mock.mockClear();
  }
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

    // ── First call: the series is upserted on its unique name ──
    vi.mocked(db.fileAsset).findUnique.mockResolvedValueOnce(opfAsset("file-opf-1", "/tmp/root/Book1/metadata.opf"));
    // The prefix query also returns a file one folder down; the adapter must drop it.
    fileAssetFindManyMock.mockResolvedValueOnce([
      ...epubSibling("file-epub-1", "/tmp/root/Book1/book.epub"),
      ...epubSibling("file-epub-nested", "/tmp/root/Book1/Extras/bonus.epub"),
    ] as never);
    vi.mocked(db.editionFile).findFirst.mockResolvedValueOnce({ editionId: "edition-1", fileAssetId: "file-epub-1", id: "ef-1", role: "PRIMARY" } as never);
    vi.mocked(db.edition).findUnique.mockResolvedValueOnce({ id: "edition-1", publisher: null, publishedAt: null, workId: "work-1" } as never);
    editionUpdateMock.mockResolvedValueOnce({} as never); // publisher/date update
    vi.mocked(db.work).findUnique.mockResolvedValueOnce({ id: "work-1", description: null, seriesId: null } as never);
    workUpdateMock.mockResolvedValueOnce({} as never);
    seriesUpsertMock.mockResolvedValueOnce({ id: "series-1", name: "The Kingkiller Chronicle" });

    const result1 = await services.parseFileAssetMetadata({ fileAssetId: "file-opf-1", now: new Date("2025-01-01T00:00:00.000Z") });
    expect(result1.availabilityStatus).toBe("PRESENT");
    expect(fileAssetFindManyMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.editionFile).findFirst.mock.calls).toEqual([[{ where: { fileAssetId: "file-epub-1" } }]]);
    expect(editionUpdateMock).toHaveBeenCalledTimes(1);
    expect(workUpdateMock).toHaveBeenCalledTimes(1);
    expect(seriesUpsertMock).toHaveBeenCalledWith({
      where: { name: "The Kingkiller Chronicle" },
      create: { name: "The Kingkiller Chronicle" },
      update: {},
      select: { id: true, name: true },
    });

    // ── Second call: series.upsert "existing" path (findFirst → existing → return, no create) ──
    vi.mocked(db.fileAsset).findUnique.mockResolvedValueOnce(opfAsset("file-opf-2", "/tmp/root/Book2/metadata.opf"));
    fileAssetFindManyMock.mockResolvedValueOnce(epubSibling("file-epub-2", "/tmp/root/Book2/book.epub"));
    vi.mocked(db.editionFile).findFirst.mockResolvedValueOnce({ editionId: "edition-2", fileAssetId: "file-epub-2", id: "ef-2", role: "PRIMARY" } as never);
    vi.mocked(db.edition).findUnique.mockResolvedValueOnce({ id: "edition-2", publisher: null, publishedAt: null, workId: "work-2" } as never);
    editionUpdateMock.mockResolvedValueOnce({} as never); // publisher/date update
    vi.mocked(db.work).findUnique.mockResolvedValueOnce({ id: "work-2", description: null, seriesId: null } as never);
    workUpdateMock.mockResolvedValueOnce({} as never);
    seriesUpsertMock.mockResolvedValueOnce({ id: "series-1", name: "The Kingkiller Chronicle" });

    const result2 = await services.parseFileAssetMetadata({ fileAssetId: "file-opf-2", now: new Date("2025-01-01T00:00:00.000Z") });
    expect(result2.availabilityStatus).toBe("PRESENT");
    // create should still be 1 (not called again — existing series was returned)
    expect(seriesUpsertMock).toHaveBeenCalledWith({
      where: { name: "The Kingkiller Chronicle" },
      create: { name: "The Kingkiller Chronicle" },
      update: {},
      select: { id: true, name: true },
    });
  });

  it("default adapter completeMove atomically transfers links and deletes the stub work on a detected move", async () => {
    vi.resetModules();
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("./services");

    const services = createIngestServices({
      hashFile: vi.fn(() => Promise.resolve({
        fullHash: "moved-hash",
        koreaderHash: "moved-koreader",
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: "moved-partial",
        sizeBytes: 100n,
      })),
    });

    // The reappeared file, now present at a new path.
    vi.mocked(db.fileAsset).findUnique.mockResolvedValueOnce({
      id: "new-file",
      absolutePath: "/tmp/runtime-root/new/book.epub",
      availabilityStatus: "PRESENT",
    } as never);
    vi.mocked(db.fileAsset).update.mockResolvedValueOnce({} as never);
    // Its freshly-created stub edition/work (the duplicate to be removed).
    vi.mocked(db.editionFile).findFirst.mockResolvedValueOnce({
      id: "stub-ef", editionId: "stub-edition", fileAssetId: "new-file", role: "PRIMARY",
    } as never);
    vi.mocked(db.edition).findUnique.mockResolvedValueOnce({
      id: "stub-edition", workId: "stub-work",
    } as never);
    vi.mocked(db.work).findUnique.mockResolvedValueOnce({ id: "stub-work" } as never);
    // The old MISSING asset still owning the real edition's link.
    fileAssetFindManyMock.mockResolvedValueOnce([
      { id: "old-file", availabilityStatus: "MISSING", fullHash: "moved-hash" },
    ] as never);
    // The stub work owns nothing but the reappeared file, so it may go.
    editionFindManyMock.mockResolvedValueOnce([{ id: "stub-edition", workId: "stub-work" }] as never);
    editionFileFindManyMock.mockResolvedValueOnce([
      { id: "stub-ef", editionId: "stub-edition", fileAssetId: "new-file" },
    ] as never);
    editionFileFindManyMock.mockResolvedValueOnce([
      { id: "real-ef", editionId: "real-edition", fileAssetId: "old-file" },
    ] as never);

    const result = await services.hashFileAsset({
      fileAssetId: "new-file",
      now: new Date("2025-01-01T01:00:00.000Z"),
    });

    expect(result.movedFromFileAssetId).toBe("old-file");
    expect(editionFindManyMock).toHaveBeenCalledWith({ where: { workId: "stub-work" } });
    // The link repoint and stub-work delete go through a single $transaction.
    expect(editionFileUpdateMock).toHaveBeenCalledWith({
      where: { id: "real-ef" },
      data: { fileAssetId: "new-file" },
    });
    expect(workDeleteMock).toHaveBeenCalledWith({ where: { id: "stub-work" } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("default adapter completeStubMerge repoints the edition and removes the stub in one transaction", async () => {
    vi.resetModules();
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({});

    vi.mocked(db.fileAsset).findUnique.mockResolvedValue({
      id: "file-1",
      absolutePath: "/tmp/runtime-root/book.epub",
      availabilityStatus: "PRESENT",
      mediaKind: "EPUB",
      metadata: {
        source: "epub",
        status: "parsed",
        version: 1,
        normalized: { title: "The Fifth Season", authors: ["N. K. Jemisin"], identifiers: { isbn13: "9780316229296" } },
      },
    } as never);
    vi.mocked(db.editionFile).findFirst.mockResolvedValueOnce({
      id: "ef-1", editionId: "stub-edition", fileAssetId: "file-1", role: "PRIMARY",
    } as never);
    vi.mocked(db.edition).findUnique.mockResolvedValueOnce({ id: "stub-edition", workId: "stub-work", formatFamily: "EBOOK" } as never);
    vi.mocked(db.work).findUnique.mockResolvedValueOnce({ id: "stub-work", enrichmentStatus: "STUB" } as never);
    // The ISBN belongs to an EBOOK edition of another, already enriched work.
    vi.mocked(db.edition).findFirst.mockResolvedValueOnce({ id: "real-edition", workId: "real-work", formatFamily: "EBOOK" } as never);
    transactionMock.mockImplementationOnce(((fn: (tx: typeof db) => Promise<void>) => fn(db)) as never);
    editionUpdateMock.mockResolvedValueOnce({} as never);

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.mergedIntoWorkId).toBe("real-work");
    expect(vi.mocked(db.edition).findFirst.mock.calls).toEqual([[{ where: { isbn13: "9780316229296", formatFamily: "EBOOK" } }]]);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(editionUpdateMock).toHaveBeenCalledWith({ where: { id: "stub-edition" }, data: { workId: "real-work" } });
    expect(workDeleteManyMock).toHaveBeenCalledWith({ where: { id: "stub-work" } });
  });

  it("default adapter completeWorkMerge moves tags, links, preferences and editions in one transaction", async () => {
    vi.resetModules();
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({});

    vi.mocked(db.work).findUnique
      .mockResolvedValueOnce({ id: "keep", description: null, coverPath: "/c", seriesId: null, seriesPosition: null, sortTitle: "t" } as never)
      .mockResolvedValueOnce({ id: "lose", description: "from loser", coverPath: "/other", seriesId: null, seriesPosition: null, sortTitle: null } as never);
    transactionMock.mockImplementationOnce(((fn: (tx: typeof db) => Promise<void>) => fn(db)) as never);
    workTagFindManyMock.mockResolvedValueOnce([{ tagId: "tag-1" }] as never);
    externalLinkFindManyMock.mockResolvedValueOnce([{ provider: "openlibrary", externalId: "OL1W" }] as never);
    preferenceFindManyMock.mockResolvedValueOnce([{ userId: "u1" }] as never);
    workUpdateMock.mockResolvedValueOnce({} as never);

    await services.mergeWorksById("keep", "lose");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(workUpdateMock).toHaveBeenCalledWith({ where: { id: "keep" }, data: { description: "from loser" } });
    expect(workTagCreateManyMock).toHaveBeenCalledWith({ data: [{ workId: "keep", tagId: "tag-1" }], skipDuplicates: true });
    expect(externalLinkDeleteManyMock).toHaveBeenCalledWith({
      where: { workId: "lose", OR: [{ provider: "openlibrary", externalId: "OL1W" }] },
    });
    expect(externalLinkUpdateManyMock).toHaveBeenCalledWith({ where: { workId: "lose" }, data: { workId: "keep" } });
    expect(preferenceDeleteManyMock).toHaveBeenCalledWith({ where: { workId: "lose", userId: { in: ["u1"] } } });
    expect(preferenceUpdateManyMock).toHaveBeenCalledWith({ where: { workId: "lose" }, data: { workId: "keep" } });
    expect(editionUpdateManyMock).toHaveBeenCalledWith({ where: { workId: "lose" }, data: { workId: "keep" } });
    expect(workDeleteMock).toHaveBeenCalledWith({ where: { id: "lose" } });
  });

  it("default adapter completeWorkMerge skips the no-op statements when nothing needs reconciling", async () => {
    vi.resetModules();
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("./services");
    const services = createIngestServices({});

    vi.mocked(db.work).findUnique
      .mockResolvedValueOnce({ id: "keep", description: "d", coverPath: "/c", seriesId: "s", seriesPosition: 1, sortTitle: "t" } as never)
      .mockResolvedValueOnce({ id: "lose", description: "x", coverPath: "/x", seriesId: "s2", seriesPosition: 2, sortTitle: "u" } as never);
    transactionMock.mockImplementationOnce(((fn: (tx: typeof db) => Promise<void>) => fn(db)) as never);

    await services.mergeWorksById("keep", "lose");

    expect(workUpdateMock).not.toHaveBeenCalled();
    expect(workTagCreateManyMock).not.toHaveBeenCalled();
    expect(externalLinkDeleteManyMock).not.toHaveBeenCalled();
    expect(preferenceDeleteManyMock).not.toHaveBeenCalled();
    expect(workDeleteMock).toHaveBeenCalledWith({ where: { id: "lose" } });
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
