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

const getCurrentUserMock = vi.fn();
vi.mock("~/lib/auth-server", () => ({
  getCurrentUser: getCurrentUserMock,
}));

const workFindUniqueOrThrowMock = vi.fn();
const readingProgressFindManyMock = vi.fn();
const readingProgressFindFirstMock = vi.fn();
const readingProgressUpdateMock = vi.fn();
const readingProgressCreateMock = vi.fn();
const workProgressPreferenceFindUniqueMock = vi.fn();
const userPreferenceFindUniqueMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findUniqueOrThrow: workFindUniqueOrThrowMock },
    readingProgress: {
      findMany: readingProgressFindManyMock,
      findFirst: readingProgressFindFirstMock,
      update: readingProgressUpdateMock,
      create: readingProgressCreateMock,
    },
    workProgressPreference: { findUnique: workProgressPreferenceFindUniqueMock },
    userPreference: { findUnique: userPreferenceFindUniqueMock },
  },
}));

import {
  getReadingProgressServerFn,
  updateReadingProgressServerFn,
  getBulkReadingProgressServerFn,
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

  it("updates existing progress record", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    const existing = { id: "rp1", percent: 25 };
    readingProgressFindFirstMock.mockResolvedValue(existing);
    const updated = { id: "rp1", percent: 50 };
    readingProgressUpdateMock.mockResolvedValue(updated);

    const result = await updateReadingProgressServerFn({
      data: { editionId: "e1", percent: 50, progressKind: "EBOOK" },
    });

    expect(readingProgressFindFirstMock).toHaveBeenCalledWith({
      where: { userId: "user-1", editionId: "e1", progressKind: "EBOOK" },
    });
    expect(readingProgressUpdateMock).toHaveBeenCalledWith({
      where: { id: "rp1" },
      data: { percent: 50, locator: {}, source: "manual" },
    });
    expect(result).toBe(updated);
  });

  it("creates new progress record when none exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    readingProgressFindFirstMock.mockResolvedValue(null);
    const created = { id: "rp-new", percent: 75 };
    readingProgressCreateMock.mockResolvedValue(created);

    const result = await updateReadingProgressServerFn({
      data: { editionId: "e1", percent: 75, progressKind: "AUDIO" },
    });

    expect(readingProgressCreateMock).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        editionId: "e1",
        progressKind: "AUDIO",
        percent: 75,
        locator: {},
        source: "manual",
      },
    });
    expect(result).toBe(created);
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
