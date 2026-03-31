import type { ReadingProgressRecord, KoboReadingState, KoboStateUpdatePayload, KoboLocation } from "./types";

interface StatusInfoPayload {
  Status?: string | number;
  LastModified?: string;
}

interface BookmarkPayload {
  ProgressPercent?: number;
  Location?: KoboLocation;
  LastModified?: string;
}

interface StatisticsPayload {
  LastModified?: string;
  SpentReadingMinutes?: number;
  RemainingTimeMinutes?: number;
}

interface ReadingStateItem {
  EntitlementId?: string;
  LastModified?: string;
  StatusInfo?: StatusInfoPayload;
  CurrentBookmark?: BookmarkPayload;
  Statistics?: StatisticsPayload;
}

interface KoboStatePutPayload {
  ReadingStates?: ReadingStateItem[];
}

export function formatReadingState(
  progress: ReadingProgressRecord,
  editionId: string,
): KoboReadingState {
  const timestamp = progress.updatedAt.toISOString();
  const percent = progress.percent ?? 0;

  let status: string;
  let timesStarted: number;
  if (percent <= 0 || progress.percent === null) {
    status = "ReadyToRead";
    timesStarted = 0;
  } else if (percent >= 100) {
    status = "Finished";
    timesStarted = 1;
  } else {
    status = "Reading";
    timesStarted = 1;
  }

  const koboLocation = progress.locator.koboLocation;

  const bookmark: KoboReadingState["CurrentBookmark"] = {
    LastModified: timestamp,
  };
  if (koboLocation) {
    bookmark.Location = koboLocation;
  }
  if (progress.percent !== null && progress.percent > 0) {
    bookmark.ProgressPercent = progress.percent;
  }

  return {
    EntitlementId: editionId,
    Created: timestamp,
    LastModified: timestamp,
    PriorityTimestamp: timestamp,
    StatusInfo: {
      LastModified: timestamp,
      Status: status,
      TimesStartedReading: timesStarted,
    },
    Statistics: {
      LastModified: timestamp,
    },
    CurrentBookmark: bookmark,
  };
}

export function parseStateUpdate(
  payload: KoboStatePutPayload | string | null | undefined,
): KoboStateUpdatePayload | { error: string } {
  if (typeof payload !== "object" || payload === null) {
    return { error: "Payload must be an object" };
  }

  const states = payload.ReadingStates;
  if (!states || !Array.isArray(states) || states.length === 0) {
    return { error: "Missing ReadingStates" };
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const state = states[0]!;

  const statusInfo = state.StatusInfo;
  if (!statusInfo || typeof statusInfo !== "object") {
    return { error: "Missing StatusInfo" };
  }

  const lastModified = state.LastModified;
  if (typeof lastModified !== "string") {
    return { error: "Missing LastModified" };
  }

  const status = typeof statusInfo.Status === "string" ? statusInfo.Status : "ReadyToRead";

  const bookmark = state.CurrentBookmark;
  const progress = typeof bookmark?.ProgressPercent === "number" ? bookmark.ProgressPercent : 0;
  const location = bookmark?.Location ?? null;

  return { status, progress, location, lastModified };
}

export function resolveConflict(
  serverUpdatedAt: Date,
  deviceLastModified: string,
): { winner: "server" | "device" } {
  const deviceTime = new Date(deviceLastModified).getTime();
  const serverTime = serverUpdatedAt.getTime();
  return { winner: deviceTime >= serverTime ? "device" : "server" };
}
