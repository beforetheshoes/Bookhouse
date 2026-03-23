import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const findManyMock = vi.fn();
const updateMock = vi.fn();
const audioLinkFindUniqueOrThrowMock = vi.fn();
const workFindUniqueOrThrowMock = vi.fn();
const workUpdateMock = vi.fn();
const workDeleteMock = vi.fn();
const editionUpdateManyMock = vi.fn();
const editionFileFindManyMock = vi.fn();
const importJobCreateMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    audioLink: { findMany: findManyMock, update: updateMock, findUniqueOrThrow: audioLinkFindUniqueOrThrowMock },
    work: { findUniqueOrThrow: workFindUniqueOrThrowMock, update: workUpdateMock, delete: workDeleteMock },
    edition: { updateMany: editionUpdateManyMock },
    editionFile: { findMany: editionFileFindManyMock },
    importJob: { create: importJobCreateMock },
  },
}));

const enqueueLibraryJobMock = vi.fn();
const LIBRARY_JOB_NAMES = { MATCH_AUDIO: "match-audio" };
vi.mock("@bookhouse/shared", () => ({
  enqueueLibraryJob: enqueueLibraryJobMock,
  LIBRARY_JOB_NAMES,
}));

import {
  getAudioLinksServerFn,
  confirmAudioLinkServerFn,
  ignoreAudioLinkServerFn,
  rematchAllAudioServerFn,
} from "./audio-links";

describe("getAudioLinksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    updateMock.mockReset();
  });

  it("calls db.audioLink.findMany with correct includes and orderBy confidence desc", async () => {
    findManyMock.mockResolvedValue([]);
    await getAudioLinksServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        ebookWork: {
          include: {
            editions: {
              include: {
                contributors: { include: { contributor: true } },
                editionFiles: {
                  include: {
                    fileAsset: {
                      select: { absolutePath: true, mediaKind: true },
                    },
                  },
                },
              },
            },
          },
        },
        audioWork: {
          include: {
            editions: {
              include: {
                contributors: { include: { contributor: true } },
                editionFiles: {
                  include: {
                    fileAsset: {
                      select: { absolutePath: true, mediaKind: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { confidence: "desc" },
    });
  });

  it("returns only links where audio work has audio files", async () => {
    const fakeData = [
      {
        id: "al-1",
        confidence: 0.95,
        audioWork: { editions: [{ editionFiles: [{ fileAsset: { mediaKind: "AUDIO" } }] }] },
      },
      {
        id: "al-2",
        confidence: 0.90,
        audioWork: { editions: [{ editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }] }] },
      },
    ];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getAudioLinksServerFn();
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe("al-1");
  });

  it("returns empty array when all links are sidecar-only", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "al-1",
        audioWork: { editions: [{ editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }] }] },
      },
    ]);
    const result = await getAudioLinksServerFn();
    expect(result).toHaveLength(0);
  });
});

describe("confirmAudioLinkServerFn", () => {
  beforeEach(() => {
    audioLinkFindUniqueOrThrowMock.mockReset();
    workFindUniqueOrThrowMock.mockReset();
    workUpdateMock.mockReset();
    workDeleteMock.mockReset();
    editionUpdateManyMock.mockReset();
  });

  it("moves editions from audio work to ebook work and deletes audio work", async () => {
    audioLinkFindUniqueOrThrowMock.mockResolvedValue({
      ebookWorkId: "work-ebook",
      audioWorkId: "work-audio",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-ebook", description: "desc", language: "en", coverPath: "/cover", seriesId: null, seriesPosition: null, sortTitle: "title" })
      .mockResolvedValueOnce({ id: "work-audio", description: null, language: null, coverPath: null, seriesId: null, seriesPosition: null, sortTitle: null });
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    const result = await confirmAudioLinkServerFn({ data: { id: "al-1" } });

    expect(audioLinkFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "al-1" },
      select: { ebookWorkId: true, audioWorkId: true },
    });
    expect(editionUpdateManyMock).toHaveBeenCalledWith({
      where: { workId: "work-audio" },
      data: { workId: "work-ebook" },
    });
    expect(workDeleteMock).toHaveBeenCalledWith({
      where: { id: "work-audio" },
    });
    expect(result).toEqual({ success: true });
  });

  it("reconciles metadata by filling nulls on ebook work from audio work", async () => {
    audioLinkFindUniqueOrThrowMock.mockResolvedValue({
      ebookWorkId: "work-ebook",
      audioWorkId: "work-audio",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-ebook", description: null, language: null, coverPath: null, seriesId: null, seriesPosition: null, sortTitle: null })
      .mockResolvedValueOnce({ id: "work-audio", description: "audio desc", language: "fr", coverPath: "/audio-cover", seriesId: "series-1", seriesPosition: 2, sortTitle: "audio sort" });
    workUpdateMock.mockResolvedValue({});
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    await confirmAudioLinkServerFn({ data: { id: "al-1" } });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "work-ebook" },
      data: {
        description: "audio desc",
        language: "fr",
        coverPath: "/audio-cover",
        seriesId: "series-1",
        seriesPosition: 2,
        sortTitle: "audio sort",
      },
    });
  });

  it("does not call work.update when no fields need reconciliation", async () => {
    audioLinkFindUniqueOrThrowMock.mockResolvedValue({
      ebookWorkId: "work-ebook",
      audioWorkId: "work-audio",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-ebook", description: "desc", language: "en", coverPath: "/cover", seriesId: "s1", seriesPosition: 1, sortTitle: "title" })
      .mockResolvedValueOnce({ id: "work-audio", description: "other", language: "fr", coverPath: "/other", seriesId: "s2", seriesPosition: 2, sortTitle: "other" });
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    await confirmAudioLinkServerFn({ data: { id: "al-1" } });

    expect(workUpdateMock).not.toHaveBeenCalled();
  });
});

describe("ignoreAudioLinkServerFn", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it("updates reviewStatus to IGNORED", async () => {
    updateMock.mockResolvedValue({});
    const result = await ignoreAudioLinkServerFn({ data: { id: "al-1" } });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "al-1" },
      data: { reviewStatus: "IGNORED" },
    });
    expect(result).toEqual({ success: true });
  });
});

describe("rematchAllAudioServerFn", () => {
  beforeEach(() => {
    editionFileFindManyMock.mockReset();
    importJobCreateMock.mockReset();
    enqueueLibraryJobMock.mockReset();
  });

  it("queries audiobook file assets with correct filters", async () => {
    editionFileFindManyMock.mockResolvedValue([]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });

    await rematchAllAudioServerFn();

    expect(editionFileFindManyMock).toHaveBeenCalledWith({
      where: {
        edition: { formatFamily: "AUDIOBOOK" },
        fileAsset: { mediaKind: "AUDIO" },
      },
      select: { fileAssetId: true },
      distinct: ["fileAssetId"],
    });
  });

  it("creates an ImportJob with kind MATCH_AUDIO and totalFiles count", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { fileAssetId: "fa-1" },
      { fileAssetId: "fa-2" },
    ]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });
    enqueueLibraryJobMock.mockResolvedValue("bull-1");

    await rematchAllAudioServerFn();

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "MATCH_AUDIO",
        status: "QUEUED",
        totalFiles: 2,
      },
    });
  });

  it("enqueues a MATCH_AUDIO job for each file asset", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { fileAssetId: "fa-1" },
      { fileAssetId: "fa-2" },
      { fileAssetId: "fa-3" },
    ]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });
    enqueueLibraryJobMock.mockResolvedValue("bull-1");

    await rematchAllAudioServerFn();

    expect(enqueueLibraryJobMock).toHaveBeenCalledTimes(3);
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_AUDIO,
      { fileAssetId: "fa-1", importJobId: "job-1" },
    );
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_AUDIO,
      { fileAssetId: "fa-2", importJobId: "job-1" },
    );
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_AUDIO,
      { fileAssetId: "fa-3", importJobId: "job-1" },
    );
  });

  it("returns importJobId and enqueuedCount", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { fileAssetId: "fa-1" },
      { fileAssetId: "fa-2" },
    ]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });
    enqueueLibraryJobMock.mockResolvedValue("bull-1");

    const result = await rematchAllAudioServerFn();

    expect(result).toEqual({ importJobId: "job-1", enqueuedCount: 2 });
  });

  it("returns zero count when no audiobook files exist", async () => {
    editionFileFindManyMock.mockResolvedValue([]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });

    const result = await rematchAllAudioServerFn();

    expect(result).toEqual({ importJobId: "job-1", enqueuedCount: 0 });
    expect(enqueueLibraryJobMock).not.toHaveBeenCalled();
  });
});
