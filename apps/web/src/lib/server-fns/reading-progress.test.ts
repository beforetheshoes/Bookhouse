import { describe, it, expect, vi, beforeEach } from "vitest";

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

const getCurrentUserMock = vi.fn();
vi.mock("~/lib/auth-server", () => ({
  getCurrentUser: getCurrentUserMock,
}));

const workFindUniqueOrThrowMock = vi.fn();
const readingProgressFindManyMock = vi.fn();
const readingProgressUpsertMock = vi.fn();
const workProgressPreferenceFindUniqueMock = vi.fn();
const userPreferenceFindUniqueMock = vi.fn();
const editionFindManyMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findUniqueOrThrow: workFindUniqueOrThrowMock },
    edition: { findMany: editionFindManyMock },
    readingProgress: {
      findMany: readingProgressFindManyMock,
      upsert: readingProgressUpsertMock,
    },
    workProgressPreference: { findUnique: workProgressPreferenceFindUniqueMock },
    userPreference: { findUnique: userPreferenceFindUniqueMock },
  },
}));

import {
  getReadingProgressServerFn,
  updateReadingProgressServerFn,
  getBulkReadingProgressServerFn,
  markWorksAsReadServerFn,
} from "./reading-progress";

describe("getReadingProgressServerFn", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when user not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(
      getReadingProgressServerFn({ data: { workId: "w1" } }),
    ).rejects.toThrow("Not authenticated");
  });

  it("returns progress and tracking mode for authenticated user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    workFindUniqueOrThrowMock.mockResolvedValue({
      editions: [{ id: "e1" }, { id: "e2" }],
    });
    const fakeProgress = [{ id: "rp1", editionId: "e1", percent: 50 }];
    readingProgressFindManyMock.mockResolvedValue(fakeProgress);
    workProgressPreferenceFindUniqueMock.mockResolvedValue(null);
    userPreferenceFindUniqueMock.mockResolvedValue({ progressTrackingMode: "BY_WORK" });

    const result = await getReadingProgressServerFn({ data: { workId: "w1" } });

    expect(workFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      include: { editions: { select: { id: true } } },
    });
    expect(readingProgressFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1", editionId: { in: ["e1", "e2"] } },
    });
    expect(result).toEqual({
      progress: fakeProgress,
      trackingMode: "BY_WORK",
    });
  });

  it("uses work-level preference over user preference", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    workFindUniqueOrThrowMock.mockResolvedValue({ editions: [] });
    readingProgressFindManyMock.mockResolvedValue([]);
    workProgressPreferenceFindUniqueMock.mockResolvedValue({ progressTrackingMode: "BY_EDITION" });
    userPreferenceFindUniqueMock.mockResolvedValue({ progressTrackingMode: "BY_WORK" });

    const result = await getReadingProgressServerFn({ data: { workId: "w1" } });
    expect(result.trackingMode).toBe("BY_EDITION");
  });

  it("defaults to BY_EDITION when no preferences exist", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    workFindUniqueOrThrowMock.mockResolvedValue({ editions: [] });
    readingProgressFindManyMock.mockResolvedValue([]);
    workProgressPreferenceFindUniqueMock.mockResolvedValue(null);
    userPreferenceFindUniqueMock.mockResolvedValue(null);

    const result = await getReadingProgressServerFn({ data: { workId: "w1" } });
    expect(result.trackingMode).toBe("BY_EDITION");
  });
});

describe("updateReadingProgressServerFn", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when user not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(
      updateReadingProgressServerFn({
        data: { editionId: "e1", percent: 50, progressKind: "EBOOK" },
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("upserts the manual progress row by its per-source unique key", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    const saved = { id: "rp1", percent: 50 };
    readingProgressUpsertMock.mockResolvedValue(saved);

    const result = await updateReadingProgressServerFn({
      data: { editionId: "e1", percent: 50, progressKind: "EBOOK" },
    });

    expect(readingProgressUpsertMock).toHaveBeenCalledWith({
      where: {
        userId_editionId_progressKind_source: {
          userId: "user-1",
          editionId: "e1",
          progressKind: "EBOOK",
          source: "manual",
        },
      },
      create: {
        userId: "user-1",
        editionId: "e1",
        progressKind: "EBOOK",
        percent: 50,
        locator: {},
        source: "manual",
      },
      update: { percent: 50, locator: {} },
    });
    expect(result).toBe(saved);
  });

  it("upserts manual progress for non-EBOOK kinds without touching other sources", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    const saved = { id: "rp-new", percent: 75 };
    readingProgressUpsertMock.mockResolvedValue(saved);

    const result = await updateReadingProgressServerFn({
      data: { editionId: "e1", percent: 75, progressKind: "AUDIO" },
    });

    expect(readingProgressUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_editionId_progressKind_source: {
            userId: "user-1",
            editionId: "e1",
            progressKind: "AUDIO",
            source: "manual",
          },
        },
      }),
    );
    expect(result).toBe(saved);
  });
});

describe("getBulkReadingProgressServerFn", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when user not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(getBulkReadingProgressServerFn()).rejects.toThrow("Not authenticated");
  });

  it("returns max percent per work", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    readingProgressFindManyMock.mockResolvedValue([
      { percent: 50, edition: { workId: "w1" } },
      { percent: 75, edition: { workId: "w1" } },
      { percent: 100, edition: { workId: "w2" } },
      { percent: null, edition: { workId: "w3" } },
    ]);

    const result = await getBulkReadingProgressServerFn();

    expect(readingProgressFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { edition: { select: { workId: true } } },
    });
    expect(result).toEqual({ w1: 75, w2: 100 });
  });

  it("returns empty object when no progress", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    readingProgressFindManyMock.mockResolvedValue([]);

    const result = await getBulkReadingProgressServerFn();
    expect(result).toEqual({});
  });
});

describe("markWorksAsReadServerFn", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when user not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(
      markWorksAsReadServerFn({ data: { workIds: ["w1"] } }),
    ).rejects.toThrow("Not authenticated");
  });

  it("upserts 100% manual progress for every edition of every work", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    editionFindManyMock.mockResolvedValue([
      { id: "e1", workId: "w1", formatFamily: "EBOOK" },
      { id: "e2", workId: "w1", formatFamily: "AUDIOBOOK" },
      { id: "e3", workId: "w2", formatFamily: "EBOOK" },
    ]);
    readingProgressUpsertMock.mockResolvedValue({});

    const result = await markWorksAsReadServerFn({ data: { workIds: ["w1", "w2"] } });

    expect(editionFindManyMock).toHaveBeenCalledWith({
      where: { workId: { in: ["w1", "w2"] } },
      select: { id: true, workId: true, formatFamily: true },
    });
    expect(readingProgressUpsertMock).toHaveBeenCalledTimes(3);
    expect(readingProgressUpsertMock).toHaveBeenCalledWith({
      where: {
        userId_editionId_progressKind_source: {
          userId: "user-1",
          editionId: "e1",
          progressKind: "EBOOK",
          source: "manual",
        },
      },
      create: {
        userId: "user-1",
        editionId: "e1",
        progressKind: "EBOOK",
        percent: 100,
        locator: {},
        source: "manual",
      },
      update: { percent: 100, locator: {} },
    });
    expect(result).toEqual({ markedWorkIds: ["w1", "w2"], markedEditionCount: 3 });
  });

  it("derives the progress kind from each edition's format family", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    editionFindManyMock.mockResolvedValue([
      { id: "e2", workId: "w1", formatFamily: "AUDIOBOOK" },
    ]);
    readingProgressUpsertMock.mockResolvedValue({});

    await markWorksAsReadServerFn({ data: { workIds: ["w1"] } });

    expect(readingProgressUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_editionId_progressKind_source: {
            userId: "user-1",
            editionId: "e2",
            progressKind: "AUDIO",
            source: "manual",
          },
        },
      }),
    );
  });

  it("reports only works that actually had editions", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    editionFindManyMock.mockResolvedValue([
      { id: "e1", workId: "w1", formatFamily: "EBOOK" },
    ]);
    readingProgressUpsertMock.mockResolvedValue({});

    const result = await markWorksAsReadServerFn({ data: { workIds: ["w1", "w-empty"] } });

    expect(result).toEqual({ markedWorkIds: ["w1"], markedEditionCount: 1 });
  });

  it("does nothing when none of the works have editions", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    editionFindManyMock.mockResolvedValue([]);

    const result = await markWorksAsReadServerFn({ data: { workIds: ["w-empty"] } });

    expect(readingProgressUpsertMock).not.toHaveBeenCalled();
    expect(result).toEqual({ markedWorkIds: [], markedEditionCount: 0 });
  });
});
