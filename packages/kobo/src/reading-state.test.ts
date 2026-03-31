import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReadingProgressRecord, KoboLocation } from "./types";
import { formatReadingState, parseStateUpdate, resolveConflict } from "./reading-state";

const NOW = new Date("2024-07-01T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

const mockLocation: KoboLocation = {
  Source: "OEBPS/xhtml/chapter01.xhtml",
  Type: "KoboSpan",
  Value: "kobo.1.1",
};

function makeProgress(overrides: Partial<ReadingProgressRecord> = {}): ReadingProgressRecord {
  return {
    id: "rp-1",
    userId: "u1",
    editionId: "ed-1",
    progressKind: "EBOOK",
    locator: {},
    percent: 42,
    source: "kobo",
    updatedAt: NOW,
    ...overrides,
  };
}

describe("formatReadingState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats 0% as ReadyToRead with TimesStartedReading 0", () => {
    const progress = makeProgress({ percent: 0 });
    const result = formatReadingState(progress, "ed-1");
    expect(result.StatusInfo.Status).toBe("ReadyToRead");
    expect(result.StatusInfo.TimesStartedReading).toBe(0);
  });

  it("formats null percent as ReadyToRead", () => {
    const progress = makeProgress({ percent: null });
    const result = formatReadingState(progress, "ed-1");
    expect(result.StatusInfo.Status).toBe("ReadyToRead");
    expect(result.StatusInfo.TimesStartedReading).toBe(0);
  });

  it("formats 50% as Reading with TimesStartedReading 1", () => {
    const progress = makeProgress({ percent: 50 });
    const result = formatReadingState(progress, "ed-1");
    expect(result.StatusInfo.Status).toBe("Reading");
    expect(result.StatusInfo.TimesStartedReading).toBe(1);
  });

  it("formats 100% as Finished with TimesStartedReading 1", () => {
    const progress = makeProgress({ percent: 100 });
    const result = formatReadingState(progress, "ed-1");
    expect(result.StatusInfo.Status).toBe("Finished");
    expect(result.StatusInfo.TimesStartedReading).toBe(1);
  });

  it("uses updatedAt for all timestamp fields", () => {
    const progress = makeProgress();
    const result = formatReadingState(progress, "ed-1");
    expect(result.Created).toBe(NOW_ISO);
    expect(result.LastModified).toBe(NOW_ISO);
    expect(result.PriorityTimestamp).toBe(NOW_ISO);
    expect(result.StatusInfo.LastModified).toBe(NOW_ISO);
    expect(result.Statistics.LastModified).toBe(NOW_ISO);
    expect(result.CurrentBookmark.LastModified).toBe(NOW_ISO);
  });

  it("sets EntitlementId to the provided editionId", () => {
    const progress = makeProgress();
    const result = formatReadingState(progress, "ed-42");
    expect(result.EntitlementId).toBe("ed-42");
  });

  it("includes koboLocation in CurrentBookmark.Location", () => {
    const progress = makeProgress({ locator: { koboLocation: mockLocation } });
    const result = formatReadingState(progress, "ed-1");
    expect(result.CurrentBookmark.Location).toEqual(mockLocation);
  });

  it("sets CurrentBookmark.ProgressPercent from percent", () => {
    const progress = makeProgress({ percent: 73 });
    const result = formatReadingState(progress, "ed-1");
    expect(result.CurrentBookmark.ProgressPercent).toBe(73);
  });

  it("omits CurrentBookmark.Location when locator has no koboLocation", () => {
    const progress = makeProgress({ locator: {} });
    const result = formatReadingState(progress, "ed-1");
    expect(result.CurrentBookmark.Location).toBeUndefined();
    expect("Location" in result.CurrentBookmark).toBe(false);
  });

  it("omits CurrentBookmark.ProgressPercent when percent is 0", () => {
    const progress = makeProgress({ percent: 0 });
    const result = formatReadingState(progress, "ed-1");
    expect(result.CurrentBookmark.ProgressPercent).toBeUndefined();
    expect("ProgressPercent" in result.CurrentBookmark).toBe(false);
  });

  it("omits CurrentBookmark.ProgressPercent when percent is null", () => {
    const progress = makeProgress({ percent: null });
    const result = formatReadingState(progress, "ed-1");
    expect(result.CurrentBookmark.ProgressPercent).toBeUndefined();
  });
});

describe("parseStateUpdate", () => {
  // Actual payload format sent by Kobo devices
  const validPayload = {
    ReadingStates: [{
      EntitlementId: "ed-1",
      LastModified: "2024-07-01T12:00:00.000Z",
      StatusInfo: {
        Status: "Reading",
        LastModified: "2024-07-01T12:00:00.000Z",
      },
      CurrentBookmark: {
        ProgressPercent: 42,
        LastModified: "2024-07-01T12:00:00.000Z",
        Location: {
          Source: "OEBPS/xhtml/chapter01.xhtml",
          Type: "KoboSpan",
          Value: "kobo.1.1",
        },
      },
      Statistics: {
        LastModified: "2024-07-01T12:00:00.000Z",
        SpentReadingMinutes: 10,
        RemainingTimeMinutes: 300,
      },
    }],
  };

  it("parses a valid Kobo payload", () => {
    const result = parseStateUpdate(validPayload);
    expect(result).toEqual({
      status: "Reading",
      progress: 42,
      location: {
        Source: "OEBPS/xhtml/chapter01.xhtml",
        Type: "KoboSpan",
        Value: "kobo.1.1",
      },
      lastModified: "2024-07-01T12:00:00.000Z",
    });
  });

  it("returns error for non-object payload", () => {
    const result = parseStateUpdate("not an object");
    expect(result).toEqual({ error: "Payload must be an object" });
  });

  it("returns error for null payload", () => {
    const result = parseStateUpdate(null);
    expect(result).toEqual({ error: "Payload must be an object" });
  });

  it("returns error for missing ReadingStates", () => {
    const result = parseStateUpdate({} as { ReadingStates: never[] });
    expect(result).toEqual({ error: "Missing ReadingStates" });
  });

  it("returns error for empty ReadingStates array", () => {
    const result = parseStateUpdate({ ReadingStates: [] });
    expect(result).toEqual({ error: "Missing ReadingStates" });
  });

  it("returns error for missing StatusInfo in reading state", () => {
    const result = parseStateUpdate({
      ReadingStates: [{ LastModified: "2024-07-01T12:00:00.000Z" }],
    });
    expect(result).toEqual({ error: "Missing StatusInfo" });
  });

  it("returns error for missing LastModified", () => {
    const result = parseStateUpdate({
      ReadingStates: [{
        StatusInfo: { Status: "Reading" },
      }],
    });
    expect(result).toEqual({ error: "Missing LastModified" });
  });

  it("handles missing Location gracefully", () => {
    const result = parseStateUpdate({
      ReadingStates: [{
        LastModified: "2024-07-01T12:00:00.000Z",
        StatusInfo: { Status: "Reading", LastModified: "2024-07-01T12:00:00.000Z" },
        CurrentBookmark: { ProgressPercent: 50 },
      }],
    });
    expect(result).toEqual({
      status: "Reading",
      progress: 50,
      location: null,
      lastModified: "2024-07-01T12:00:00.000Z",
    });
  });

  it("defaults progress to 0 when CurrentBookmark is missing", () => {
    const result = parseStateUpdate({
      ReadingStates: [{
        LastModified: "2024-07-01T12:00:00.000Z",
        StatusInfo: { Status: "ReadyToRead", LastModified: "2024-07-01T12:00:00.000Z" },
      }],
    });
    expect(result).toEqual({
      status: "ReadyToRead",
      progress: 0,
      location: null,
      lastModified: "2024-07-01T12:00:00.000Z",
    });
  });

  it("defaults status to ReadyToRead when Status is not a string", () => {
    const result = parseStateUpdate({
      ReadingStates: [{
        LastModified: "2024-07-01T12:00:00.000Z",
        StatusInfo: { Status: 123, LastModified: "2024-07-01T12:00:00.000Z" },
      }],
    });
    expect(result).toEqual({
      status: "ReadyToRead",
      progress: 0,
      location: null,
      lastModified: "2024-07-01T12:00:00.000Z",
    });
  });
});

describe("resolveConflict", () => {
  it("device wins when device timestamp is newer", () => {
    const server = new Date("2024-07-01T10:00:00.000Z");
    const device = "2024-07-01T12:00:00.000Z";
    expect(resolveConflict(server, device)).toEqual({ winner: "device" });
  });

  it("server wins when server timestamp is newer", () => {
    const server = new Date("2024-07-01T14:00:00.000Z");
    const device = "2024-07-01T12:00:00.000Z";
    expect(resolveConflict(server, device)).toEqual({ winner: "server" });
  });

  it("device wins on exact tie", () => {
    const server = new Date("2024-07-01T12:00:00.000Z");
    const device = "2024-07-01T12:00:00.000Z";
    expect(resolveConflict(server, device)).toEqual({ winner: "device" });
  });

  it("handles ISO timestamps with different timezone offsets", () => {
    const server = new Date("2024-07-01T12:00:00.000Z");
    const device = "2024-07-01T14:00:00.000+02:00"; // same instant as 12:00 UTC
    expect(resolveConflict(server, device)).toEqual({ winner: "device" });
  });
});
