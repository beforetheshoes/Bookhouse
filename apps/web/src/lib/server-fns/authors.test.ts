import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const contributorFindManyMock = vi.fn();
const contributorFindUniqueOrThrowMock = vi.fn();
const workFindManyMock = vi.fn();
const importJobCreateMock = vi.fn().mockResolvedValue({ id: "ij-1" });
vi.mock("@bookhouse/db", () => ({
  db: {
    contributor: {
      findMany: contributorFindManyMock,
      findUnique: vi.fn().mockResolvedValue({ id: "c1" }),
      findUniqueOrThrow: contributorFindUniqueOrThrowMock,
      update: vi.fn().mockResolvedValue({}),
    },
    work: {
      findMany: workFindManyMock,
    },
    importJob: {
      create: importJobCreateMock,
    },
  },
}));

const enqueueEnrichmentJobMock = vi.fn().mockResolvedValue("job-id");
const getActiveEnrichmentJobCountMock = vi.fn().mockResolvedValue(0);
vi.mock("@bookhouse/shared", () => ({
  enqueueEnrichmentJob: enqueueEnrichmentJobMock,
  getActiveEnrichmentJobCount: getActiveEnrichmentJobCountMock,
  ENRICHMENT_JOB_NAMES: { ENRICH_CONTRIBUTOR: "enrich-contributor" },
}));

const applyAuthorPhotoFromUrlMock = vi.fn().mockResolvedValue({ success: true });
const resizeAndSaveCoverMock = vi.fn();
vi.mock("@bookhouse/ingest", () => ({
  applyAuthorPhotoFromUrl: applyAuthorPhotoFromUrlMock,
  resizeAndSaveCover: resizeAndSaveCoverMock,
}));

import {
  getAuthorsListServerFn,
  getAuthorDetailServerFn,
  enrichAuthorPhotosServerFn,
  getEnrichAuthorPhotosProgressServerFn,
  fetchAuthorPhotoFromUrlServerFn,
} from "./authors";

describe("getAuthorsListServerFn", () => {
  beforeEach(() => {
    contributorFindManyMock.mockReset();
  });

  it("calls db.contributor.findMany with correct args and computes workCount", async () => {
    contributorFindManyMock.mockResolvedValue([
      {
        id: "c1",
        nameDisplay: "Author One",
        imagePath: null,
        editions: [
          { edition: { workId: "w1" } },
          { edition: { workId: "w1" } },
          { edition: { workId: "w2" } },
        ],
      },
    ]);
    const result = await getAuthorsListServerFn();
    expect(contributorFindManyMock).toHaveBeenCalledWith({
      where: {
        editions: { some: { role: "AUTHOR" } },
      },
      include: {
        editions: {
          where: { role: "AUTHOR" },
          include: { edition: { select: { workId: true } } },
        },
      },
      orderBy: { nameDisplay: "asc" },
    });
    expect(result).toEqual([
      { id: "c1", nameDisplay: "Author One", workCount: 2, imagePath: null },
    ]);
  });

  it("returns empty array when no authors", async () => {
    contributorFindManyMock.mockResolvedValue([]);
    const result = await getAuthorsListServerFn();
    expect(result).toEqual([]);
  });
});

describe("getAuthorDetailServerFn", () => {
  beforeEach(() => {
    contributorFindUniqueOrThrowMock.mockReset();
    workFindManyMock.mockReset();
  });

  it("fetches contributor then works and returns combined result", async () => {
    contributorFindUniqueOrThrowMock.mockResolvedValue({
      id: "c1",
      nameDisplay: "Author One",
      nameCanonical: "author one",
      imagePath: "c1",
      editions: [
        { edition: { workId: "w1" } },
        { edition: { workId: "w2" } },
        { edition: { workId: "w1" } },
      ],
    });
    const fakeWorks = [
      { id: "w1", titleDisplay: "Book One" },
      { id: "w2", titleDisplay: "Book Two" },
    ];
    workFindManyMock.mockResolvedValue(fakeWorks);

    const result = await getAuthorDetailServerFn({
      data: { authorId: "c1" },
    });

    expect(contributorFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      select: {
        id: true,
        nameDisplay: true,
        nameCanonical: true,
        imagePath: true,
        editions: {
          where: { role: "AUTHOR" },
          select: { edition: { select: { workId: true } } },
        },
      },
    });
    expect(workFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["w1", "w2"] } },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
          },
        },
      },
    });
    expect(result).toEqual({
      id: "c1",
      nameDisplay: "Author One",
      nameCanonical: "author one",
      imagePath: "c1",
      works: fakeWorks,
    });
  });

  it("propagates error when author not found", async () => {
    contributorFindUniqueOrThrowMock.mockRejectedValue(new Error("Not found"));

    await expect(
      getAuthorDetailServerFn({ data: { authorId: "nonexistent" } }),
    ).rejects.toThrow("Not found");
  });

  it("returns empty works array when author has no editions", async () => {
    contributorFindUniqueOrThrowMock.mockResolvedValue({
      id: "c1",
      nameDisplay: "Lonely Author",
      nameCanonical: "lonely author",
      imagePath: null,
      editions: [],
    });
    workFindManyMock.mockResolvedValue([]);

    const result = await getAuthorDetailServerFn({
      data: { authorId: "c1" },
    });

    expect(workFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: [] } },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
          },
        },
      },
    });
    expect(result.works).toEqual([]);
  });
});

describe("enrichAuthorPhotosServerFn", () => {
  beforeEach(() => {
    contributorFindManyMock.mockReset();
    enqueueEnrichmentJobMock.mockReset();
    enqueueEnrichmentJobMock.mockResolvedValue("job-id");
    importJobCreateMock.mockReset();
    importJobCreateMock.mockResolvedValue({ id: "ij-1" });
  });

  it("creates ImportJob and enqueues ENRICH_CONTRIBUTOR jobs with importJobId", async () => {
    contributorFindManyMock.mockResolvedValue([
      { id: "c1" },
      { id: "c2" },
    ]);

    const result = await enrichAuthorPhotosServerFn();

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "ENRICH_AUTHOR_PHOTOS",
        status: "QUEUED",
        totalFiles: 2,
        processedFiles: 0,
        errorCount: 0,
      },
    });
    expect(enqueueEnrichmentJobMock).toHaveBeenCalledTimes(2);
    expect(enqueueEnrichmentJobMock).toHaveBeenCalledWith("enrich-contributor", { contributorId: "c1", importJobId: "ij-1" });
    expect(enqueueEnrichmentJobMock).toHaveBeenCalledWith("enrich-contributor", { contributorId: "c2", importJobId: "ij-1" });
    expect(result).toEqual({ enqueuedCount: 2, importJobId: "ij-1" });
  });

  it("returns 0 when all contributors have photos", async () => {
    contributorFindManyMock.mockResolvedValue([]);

    const result = await enrichAuthorPhotosServerFn();

    expect(importJobCreateMock).not.toHaveBeenCalled();
    expect(enqueueEnrichmentJobMock).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueuedCount: 0 });
  });
});

describe("getEnrichAuthorPhotosProgressServerFn", () => {
  beforeEach(() => {
    getActiveEnrichmentJobCountMock.mockReset();
    getActiveEnrichmentJobCountMock.mockResolvedValue(0);
  });

  it("returns active count from queue", async () => {
    getActiveEnrichmentJobCountMock.mockResolvedValue(5);

    const result = await getEnrichAuthorPhotosProgressServerFn();

    expect(getActiveEnrichmentJobCountMock).toHaveBeenCalledWith("enrich-contributor");
    expect(result).toEqual({ activeCount: 5 });
  });

  it("returns 0 when no jobs are active", async () => {
    getActiveEnrichmentJobCountMock.mockResolvedValue(0);

    const result = await getEnrichAuthorPhotosProgressServerFn();

    expect(result).toEqual({ activeCount: 0 });
  });
});

describe("fetchAuthorPhotoFromUrlServerFn", () => {
  beforeEach(() => {
    applyAuthorPhotoFromUrlMock.mockReset();
    applyAuthorPhotoFromUrlMock.mockResolvedValue({ success: true });
  });

  it("calls applyAuthorPhotoFromUrl with correct args", async () => {
    const result = await fetchAuthorPhotoFromUrlServerFn({
      data: { contributorId: "c1", imageUrl: "https://example.com/photo.jpg" },
    });

    expect(applyAuthorPhotoFromUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ contributorId: "c1", imageUrl: "https://example.com/photo.jpg" }),
      expect.objectContaining({ fetchUrl: expect.any(Function) as (() => void), resizeAndSave: expect.any(Function) as (() => void) }),
      expect.objectContaining({ findContributor: expect.any(Function) as (() => void), updateContributor: expect.any(Function) as (() => void) }),
    );
    expect(result).toEqual({ success: true });
  });

  it("exercises inner deps for coverage", async () => {
    await fetchAuthorPhotoFromUrlServerFn({
      data: { contributorId: "c1", imageUrl: "https://example.com/photo.jpg" },
    });

    type InnerDeps = { fetchUrl: (url: string) => Promise<{ buffer: Buffer; contentType: string | null }>; resizeAndSave: (buf: Buffer, dir: string) => Promise<void> };
    type InnerDbDeps = { findContributor: (id: string) => Promise<object | null>; updateContributor: (id: string, data: object) => Promise<void> };
    const [[, innerDeps, innerDbDeps]] = applyAuthorPhotoFromUrlMock.mock.calls as [[object, InnerDeps, InnerDbDeps]];

    // Exercise fetchUrl
    const savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff]).buffer),
      headers: { get: () => "image/jpeg" },
    }) as typeof fetch;
    const fetchResult = await innerDeps.fetchUrl("https://example.com/img.jpg");
    expect(fetchResult.contentType).toBe("image/jpeg");
    globalThis.fetch = savedFetch;

    // Exercise resizeAndSave
    await innerDeps.resizeAndSave(Buffer.from([1]), "/tmp");
    expect(resizeAndSaveCoverMock).toHaveBeenCalled();

    // Exercise findContributor
    contributorFindManyMock.mockResolvedValueOnce({ id: "c1" });
    await innerDbDeps.findContributor("c1");

    // Exercise updateContributor
    await innerDbDeps.updateContributor("c1", { imagePath: "c1" });
  });

  it("propagates errors from applyAuthorPhotoFromUrl", async () => {
    applyAuthorPhotoFromUrlMock.mockRejectedValue(new Error("Image too small"));

    await expect(
      fetchAuthorPhotoFromUrlServerFn({
        data: { contributorId: "c1", imageUrl: "https://example.com/tiny.jpg" },
      }),
    ).rejects.toThrow("Image too small");
  });
});
