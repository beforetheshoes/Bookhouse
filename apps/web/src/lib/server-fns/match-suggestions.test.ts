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
const matchSuggestionFindUniqueOrThrowMock = vi.fn();
const workFindUniqueOrThrowMock = vi.fn();
const workUpdateMock = vi.fn();
const workDeleteMock = vi.fn();
const editionUpdateManyMock = vi.fn();
const editionFileFindManyMock = vi.fn();
const importJobCreateMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    matchSuggestion: { findMany: findManyMock, update: updateMock, findUniqueOrThrow: matchSuggestionFindUniqueOrThrowMock },
    work: { findUniqueOrThrow: workFindUniqueOrThrowMock, update: workUpdateMock, delete: workDeleteMock },
    edition: { updateMany: editionUpdateManyMock },
    editionFile: { findMany: editionFileFindManyMock },
    importJob: { create: importJobCreateMock },
  },
}));

const enqueueLibraryJobMock = vi.fn();
const LIBRARY_JOB_NAMES = { MATCH_SUGGESTIONS: "match-suggestions" };
vi.mock("@bookhouse/shared", () => ({
  enqueueLibraryJob: enqueueLibraryJobMock,
  LIBRARY_JOB_NAMES,
}));

import {
  getMatchSuggestionsServerFn,
  acceptMatchSuggestionServerFn,
  declineMatchSuggestionServerFn,
  rematchAllServerFn,
} from "./match-suggestions";

describe("getMatchSuggestionsServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    updateMock.mockReset();
  });

  it("calls db.matchSuggestion.findMany with correct includes and orderBy confidence desc", async () => {
    findManyMock.mockResolvedValue([]);
    await getMatchSuggestionsServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        targetWork: {
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
        suggestedWork: {
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

  it("returns only suggestions where suggested work has audio files", async () => {
    const fakeData = [
      {
        id: "ms-1",
        confidence: 0.95,
        suggestedWork: { editions: [{ editionFiles: [{ fileAsset: { mediaKind: "AUDIO" } }] }] },
      },
      {
        id: "ms-2",
        confidence: 0.90,
        suggestedWork: { editions: [{ editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }] }] },
      },
    ];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getMatchSuggestionsServerFn();
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe("ms-1");
  });

  it("returns empty array when all suggestions are sidecar-only", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "ms-1",
        suggestedWork: { editions: [{ editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }] }] },
      },
    ]);
    const result = await getMatchSuggestionsServerFn();
    expect(result).toHaveLength(0);
  });
});

describe("acceptMatchSuggestionServerFn", () => {
  beforeEach(() => {
    matchSuggestionFindUniqueOrThrowMock.mockReset();
    workFindUniqueOrThrowMock.mockReset();
    workUpdateMock.mockReset();
    workDeleteMock.mockReset();
    editionUpdateManyMock.mockReset();
  });

  it("moves editions from suggested work to target work and deletes suggested work", async () => {
    matchSuggestionFindUniqueOrThrowMock.mockResolvedValue({
      targetWorkId: "work-target",
      suggestedWorkId: "work-suggested",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-target", description: "desc", language: "en", coverPath: "/cover", seriesId: null, seriesPosition: null, sortTitle: "title" })
      .mockResolvedValueOnce({ id: "work-suggested", description: null, language: null, coverPath: null, seriesId: null, seriesPosition: null, sortTitle: null });
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    const result = await acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-target" } });

    expect(matchSuggestionFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "ms-1" },
      select: { targetWorkId: true, suggestedWorkId: true },
    });
    expect(editionUpdateManyMock).toHaveBeenCalledWith({
      where: { workId: "work-suggested" },
      data: { workId: "work-target" },
    });
    expect(workDeleteMock).toHaveBeenCalledWith({
      where: { id: "work-suggested" },
    });
    expect(result).toEqual({ success: true });
  });

  it("user can choose the suggested work as the surviving work", async () => {
    matchSuggestionFindUniqueOrThrowMock.mockResolvedValue({
      targetWorkId: "work-target",
      suggestedWorkId: "work-suggested",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-suggested", description: "enriched desc", language: "en", coverPath: "/cover", seriesId: null, seriesPosition: null, sortTitle: "title" })
      .mockResolvedValueOnce({ id: "work-target", description: null, language: null, coverPath: null, seriesId: null, seriesPosition: null, sortTitle: null });
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    const result = await acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-suggested" } });

    // Editions move FROM target (losing) TO suggested (surviving)
    expect(editionUpdateManyMock).toHaveBeenCalledWith({
      where: { workId: "work-target" },
      data: { workId: "work-suggested" },
    });
    // Target work is deleted
    expect(workDeleteMock).toHaveBeenCalledWith({
      where: { id: "work-target" },
    });
    expect(result).toEqual({ success: true });
  });

  it("reconciles metadata by filling nulls on surviving work from losing work", async () => {
    matchSuggestionFindUniqueOrThrowMock.mockResolvedValue({
      targetWorkId: "work-target",
      suggestedWorkId: "work-suggested",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-target", description: null, language: null, coverPath: null, seriesId: null, seriesPosition: null, sortTitle: null })
      .mockResolvedValueOnce({ id: "work-suggested", description: "suggested desc", language: "fr", coverPath: "/suggested-cover", seriesId: "series-1", seriesPosition: 2, sortTitle: "suggested sort" });
    workUpdateMock.mockResolvedValue({});
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    await acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-target" } });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "work-target" },
      data: {
        description: "suggested desc",
        language: "fr",
        coverPath: "/suggested-cover",
        seriesId: "series-1",
        seriesPosition: 2,
        sortTitle: "suggested sort",
      },
    });
  });

  it("does not call work.update when no fields need reconciliation", async () => {
    matchSuggestionFindUniqueOrThrowMock.mockResolvedValue({
      targetWorkId: "work-target",
      suggestedWorkId: "work-suggested",
    });
    workFindUniqueOrThrowMock
      .mockResolvedValueOnce({ id: "work-target", description: "desc", language: "en", coverPath: "/cover", seriesId: "s1", seriesPosition: 1, sortTitle: "title" })
      .mockResolvedValueOnce({ id: "work-suggested", description: "other", language: "fr", coverPath: "/other", seriesId: "s2", seriesPosition: 2, sortTitle: "other" });
    editionUpdateManyMock.mockResolvedValue({ count: 1 });
    workDeleteMock.mockResolvedValue({});

    await acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-target" } });

    expect(workUpdateMock).not.toHaveBeenCalled();
  });
});

describe("declineMatchSuggestionServerFn", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it("updates reviewStatus to IGNORED", async () => {
    updateMock.mockResolvedValue({});
    const result = await declineMatchSuggestionServerFn({ data: { id: "ms-1" } });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "ms-1" },
      data: { reviewStatus: "IGNORED" },
    });
    expect(result).toEqual({ success: true });
  });
});

describe("rematchAllServerFn", () => {
  beforeEach(() => {
    editionFileFindManyMock.mockReset();
    importJobCreateMock.mockReset();
    enqueueLibraryJobMock.mockReset();
  });

  it("queries audiobook AUDIO files linked to AUDIOBOOK editions", async () => {
    editionFileFindManyMock.mockResolvedValue([]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });

    await rematchAllServerFn();

    expect(editionFileFindManyMock).toHaveBeenCalledWith({
      where: {
        edition: { formatFamily: "AUDIOBOOK" },
        fileAsset: { mediaKind: "AUDIO" },
      },
      select: { fileAssetId: true },
      distinct: ["fileAssetId"],
    });
  });

  it("creates an ImportJob with kind MATCH_SUGGESTIONS and totalFiles count", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { fileAssetId: "fa-1" },
      { fileAssetId: "fa-2" },
    ]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });
    enqueueLibraryJobMock.mockResolvedValue("bull-1");

    await rematchAllServerFn();

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "MATCH_SUGGESTIONS",
        status: "QUEUED",
        totalFiles: 2,
      },
    });
  });

  it("enqueues a MATCH_SUGGESTIONS job for each file asset", async () => {
    editionFileFindManyMock.mockResolvedValue([
      { fileAssetId: "fa-1" },
      { fileAssetId: "fa-2" },
      { fileAssetId: "fa-3" },
    ]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });
    enqueueLibraryJobMock.mockResolvedValue("bull-1");

    await rematchAllServerFn();

    expect(enqueueLibraryJobMock).toHaveBeenCalledTimes(3);
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "fa-1", importJobId: "job-1" },
    );
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "fa-2", importJobId: "job-1" },
    );
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
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

    const result = await rematchAllServerFn();

    expect(result).toEqual({ importJobId: "job-1", enqueuedCount: 2 });
  });

  it("returns zero count when no audiobook files exist", async () => {
    editionFileFindManyMock.mockResolvedValue([]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });

    const result = await rematchAllServerFn();

    expect(result).toEqual({ importJobId: "job-1", enqueuedCount: 0 });
    expect(enqueueLibraryJobMock).not.toHaveBeenCalled();
  });
});
