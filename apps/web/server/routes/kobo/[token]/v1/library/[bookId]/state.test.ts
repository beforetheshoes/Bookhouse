import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStateHandler } from "./state";
import type { StateHandlerDeps } from "./state";
import type { H3Event } from "h3";
import type { ReadingProgressRecord, KoboLocation, KoboReadingState, KoboRequestResult } from "@bookhouse/kobo";

const validToken = "a".repeat(64);

const mockDevice = {
  id: "d1",
  userId: "u1",
  deviceId: "My Kobo",
  userKey: "key",
  authToken: validToken,
  status: "ACTIVE",
  lastSyncAt: null,
  createdAt: new Date("2024-01-01"),
};

const NOW = new Date("2024-07-01T12:00:00.000Z");

const mockLocation: KoboLocation = {
  Source: "OEBPS/xhtml/chapter01.xhtml",
  Type: "KoboSpan",
  Value: "kobo.1.1",
};

const mockProgress: ReadingProgressRecord = {
  id: "rp-1",
  userId: "u1",
  editionId: "ed-1",
  progressKind: "EBOOK",
  locator: { koboLocation: mockLocation },
  percent: 42,
  source: "kobo",
  updatedAt: NOW,
};

// Actual payload format sent by Kobo devices
const validPayload = {
  ReadingStates: [{
    EntitlementId: "ed-1",
    LastModified: "2024-07-01T13:00:00.000Z",
    StatusInfo: {
      Status: "Reading",
      LastModified: "2024-07-01T13:00:00.000Z",
    },
    CurrentBookmark: {
      ProgressPercent: 55,
      LastModified: "2024-07-01T13:00:00.000Z",
      Location: {
        Source: "OEBPS/xhtml/chapter02.xhtml",
        Type: "KoboSpan",
        Value: "kobo.2.1",
      },
    },
    Statistics: {
      LastModified: "2024-07-01T13:00:00.000Z",
      SpentReadingMinutes: 16,
      RemainingTimeMinutes: 555,
    },
  }],
};

function makeEvent(bookId = "ed-1"): H3Event {
  return {
    context: { params: { token: validToken, bookId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<StateHandlerDeps> = {}): StateHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    findProgress: vi.fn().mockResolvedValue(null),
    upsertProgress: vi.fn().mockResolvedValue(mockProgress),
    getMethod: vi.fn().mockReturnValue("GET"),
    readBody: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("createStateHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET", () => {
    it("returns array with default ReadyToRead when no progress exists", async () => {
      const deps = makeDeps();
      const handler = createStateHandler(deps);
      const result = await handler(makeEvent()) as KoboReadingState[];

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        EntitlementId: "ed-1",
        StatusInfo: expect.objectContaining({
          Status: "ReadyToRead",
          TimesStartedReading: 0,
        }),
      }));
    });

    it("returns array with formatted reading state when progress exists", async () => {
      const deps = makeDeps({
        findProgress: vi.fn().mockResolvedValue(mockProgress),
      });
      const handler = createStateHandler(deps);
      const result = await handler(makeEvent()) as KoboReadingState[];

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        EntitlementId: "ed-1",
        StatusInfo: expect.objectContaining({
          Status: "Reading",
          TimesStartedReading: 1,
        }),
        CurrentBookmark: expect.objectContaining({
          ProgressPercent: 42,
          Location: mockLocation,
        }),
      }));
    });

    it("throws 400 for invalid bookId", async () => {
      const deps = makeDeps();
      const handler = createStateHandler(deps);

      try {
        await handler(makeEvent("../../../etc"));
        expect.fail("Should have thrown");
      } catch (e) {
        const err = e as Error & { statusCode: number };
        expect(err.statusCode).toBe(400);
      }
    });

    it("throws when auth fails", async () => {
      const deps = makeDeps({
        auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
      });
      const handler = createStateHandler(deps);

      await expect(handler(makeEvent())).rejects.toThrow();
    });
  });

  describe("PUT", () => {
    it("creates new progress and returns RequestResult", async () => {
      const upsertProgress = vi.fn().mockResolvedValue(mockProgress);
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue(validPayload),
        upsertProgress,
      });
      const handler = createStateHandler(deps);
      const result = await handler(makeEvent()) as KoboRequestResult;

      expect(upsertProgress).toHaveBeenCalledWith({
        userId: "u1",
        editionId: "ed-1",
        percent: 55,
        locator: { koboLocation: { Source: "OEBPS/xhtml/chapter02.xhtml", Type: "KoboSpan", Value: "kobo.2.1" } },
        source: "kobo",
      });
      expect(result).toEqual({
        RequestResult: "Success",
        UpdateResults: [{
          EntitlementId: "ed-1",
          CurrentBookmarkResult: { Result: "Success" },
          StatisticsResult: { Result: "Ignored" },
          StatusInfoResult: { Result: "Success" },
        }],
      });
    });

    it("updates progress when device timestamp is newer", async () => {
      const existingProgress: ReadingProgressRecord = {
        ...mockProgress,
        updatedAt: new Date("2024-07-01T10:00:00.000Z"),
      };
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue(validPayload),
        findProgress: vi.fn().mockResolvedValue(existingProgress),
        upsertProgress: vi.fn().mockResolvedValue({ ...mockProgress, percent: 55 }),
      });
      const handler = createStateHandler(deps);
      const result = await handler(makeEvent()) as KoboRequestResult;

      expect(deps.upsertProgress).toHaveBeenCalled();
      expect(result.RequestResult).toBe("Success");
    });

    it("skips save when server timestamp is newer", async () => {
      const existingProgress: ReadingProgressRecord = {
        ...mockProgress,
        percent: 80,
        updatedAt: new Date("2024-07-01T14:00:00.000Z"),
      };
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue(validPayload),
        findProgress: vi.fn().mockResolvedValue(existingProgress),
      });
      const handler = createStateHandler(deps);
      const result = await handler(makeEvent()) as KoboRequestResult;

      expect(deps.upsertProgress).not.toHaveBeenCalled();
      expect(result.RequestResult).toBe("Success");
    });

    it("returns 400 for invalid PUT payload", async () => {
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue({ invalid: true }),
      });
      const handler = createStateHandler(deps);

      try {
        await handler(makeEvent());
        expect.fail("Should have thrown");
      } catch (e) {
        const err = e as Error & { statusCode: number };
        expect(err.statusCode).toBe(400);
      }
    });

    it("sets source to kobo on upserted progress", async () => {
      const upsertProgress = vi.fn().mockResolvedValue(mockProgress);
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue(validPayload),
        upsertProgress,
      });
      const handler = createStateHandler(deps);
      await handler(makeEvent());

      expect(upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({ source: "kobo" }),
      );
    });

    it("stores kobo location from device update in locator", async () => {
      const upsertProgress = vi.fn().mockResolvedValue(mockProgress);
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue(validPayload),
        upsertProgress,
      });
      const handler = createStateHandler(deps);
      await handler(makeEvent());

      expect(upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          locator: { koboLocation: { Source: "OEBPS/xhtml/chapter02.xhtml", Type: "KoboSpan", Value: "kobo.2.1" } },
        }),
      );
    });

    it("stores empty locator when device update has no location", async () => {
      const payloadNoLocation = {
        ReadingStates: [{
          LastModified: "2024-07-01T13:00:00.000Z",
          StatusInfo: { Status: "Reading", LastModified: "2024-07-01T13:00:00.000Z" },
          CurrentBookmark: { ProgressPercent: 30 },
        }],
      };
      const upsertProgress = vi.fn().mockResolvedValue(mockProgress);
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("PUT"),
        readBody: vi.fn().mockResolvedValue(payloadNoLocation),
        upsertProgress,
      });
      const handler = createStateHandler(deps);
      await handler(makeEvent());

      expect(upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({ locator: {} }),
      );
    });
  });

  describe("unsupported methods", () => {
    it("throws 405 for DELETE method", async () => {
      const deps = makeDeps({
        getMethod: vi.fn().mockReturnValue("DELETE"),
      });
      const handler = createStateHandler(deps);

      try {
        await handler(makeEvent());
        expect.fail("Should have thrown");
      } catch (e) {
        const err = e as Error & { statusCode: number };
        expect(err.statusCode).toBe(405);
      }
    });
  });
});
