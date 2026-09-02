import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_guards", () => ({
  ownerOnly: vi.fn().mockResolvedValue(undefined),
  authenticatedOnly: vi
    .fn()
    .mockResolvedValue({ id: "owner-1", roles: ["OWNER"] }),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      validator: () => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      validator: () => b,
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

const mergeWorksByIdMock = vi.fn();
vi.mock("@bookhouse/ingest", () => ({
  mergeWorksById: mergeWorksByIdMock,
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
    mergeWorksByIdMock.mockReset();
    mergeWorksByIdMock.mockResolvedValue(undefined);
    matchSuggestionFindUniqueOrThrowMock.mockResolvedValue({
      targetWorkId: "work-target",
      suggestedWorkId: "work-suggested",
    });
  });

  it("merges the suggested work into the target when the target survives", async () => {
    const result = await acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-target" } });

    expect(matchSuggestionFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "ms-1" },
      select: { targetWorkId: true, suggestedWorkId: true },
    });
    expect(mergeWorksByIdMock).toHaveBeenCalledWith("work-target", "work-suggested");
    expect(result).toEqual({ success: true });
  });

  it("user can choose the suggested work as the surviving work", async () => {
    const result = await acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-suggested" } });

    expect(mergeWorksByIdMock).toHaveBeenCalledWith("work-suggested", "work-target");
    expect(result).toEqual({ success: true });
  });

  it("rejects a surviving work that is not part of the suggestion", async () => {
    await expect(
      acceptMatchSuggestionServerFn({ data: { id: "ms-1", survivingWorkId: "work-other" } }),
    ).rejects.toThrow("Surviving work must be one of the suggestion's works");
    expect(mergeWorksByIdMock).not.toHaveBeenCalled();
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
