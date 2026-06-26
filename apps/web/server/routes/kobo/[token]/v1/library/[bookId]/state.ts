import { defineEventHandler, readBody } from "h3";
import type { H3Event } from "h3";
import type { Prisma } from "@bookhouse/db";
import type { KoboAuthDeps } from "../../../../auth-helper";
import type { ReadingProgressRecord, KoboReadingState, KoboRequestResult, LocatorData, KoboLocation } from "@bookhouse/kobo";
import { httpError } from "../../../../../../utils/http-error";

export interface StateHandlerDeps {
  auth: KoboAuthDeps;
  findProgress: (userId: string, editionId: string) => Promise<ReadingProgressRecord | null>;
  editionExists: (editionId: string) => Promise<boolean>;
  upsertProgress: (params: {
    userId: string;
    editionId: string;
    percent: number;
    locator: LocatorData;
    source: string;
  }) => Promise<ReadingProgressRecord>;
  getMethod: (event: H3Event) => string;
  readBody: (event: H3Event) => Promise<{
    ReadingStates?: Array<{
      EntitlementId?: string;
      LastModified?: string;
      StatusInfo?: { Status?: string; LastModified?: string };
      CurrentBookmark?: { ProgressPercent?: number; Location?: KoboLocation; LastModified?: string };
      Statistics?: { LastModified?: string; SpentReadingMinutes?: number; RemainingTimeMinutes?: number };
    }>;
  } | null | undefined>;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

function defaultReadingState(editionId: string): KoboReadingState {
  const now = new Date().toISOString();
  return {
    EntitlementId: editionId,
    Created: now,
    LastModified: now,
    PriorityTimestamp: now,
    StatusInfo: {
      LastModified: now,
      Status: "ReadyToRead",
      TimesStartedReading: 0,
    },
    Statistics: {
      LastModified: now,
    },
    CurrentBookmark: {
      LastModified: now,
    },
  };
}

function successResult(bookId: string): KoboRequestResult {
  return {
    RequestResult: "Success",
    UpdateResults: [{
      EntitlementId: bookId,
      CurrentBookmarkResult: { Result: "Success" },
      StatisticsResult: { Result: "Ignored" },
      StatusInfoResult: { Result: "Success" },
    }],
  };
}

export function createStateHandler(deps: StateHandlerDeps) {
  return async (event: H3Event): Promise<KoboReadingState[] | KoboRequestResult> => {
    const { createKoboAuth } = await import("../../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    const device = await auth(event);

    const params = event.context.params as Record<string, string>;
    const bookId = params.bookId as string;

    if (!VALID_ID.test(bookId)) {
      throw httpError("Invalid bookId", 400);
    }

    const method = deps.getMethod(event);

    if (method === "GET") {
      const progress = await deps.findProgress(device.userId, bookId);
      if (!progress) {
        return [defaultReadingState(bookId)];
      }
      const { formatReadingState } = await import("@bookhouse/kobo");
      return [formatReadingState(progress, bookId)];
    }

    if (method === "PUT") {
      const body = await deps.readBody(event);
      const { parseStateUpdate, resolveConflict } = await import("@bookhouse/kobo");

      const parsed = parseStateUpdate(body);
      if ("error" in parsed) {
        throw httpError(parsed.error, 400);
      }

      // The Kobo still has books in its local library that may no longer exist
      // here (e.g. an edition replaced or removed by a re-scan). Acknowledge the
      // update so the device stops retrying, but skip the write that would
      // violate the ReadingProgress -> Edition foreign key.
      if (!(await deps.editionExists(bookId))) {
        return successResult(bookId);
      }

      const existing = await deps.findProgress(device.userId, bookId);

      if (existing) {
        const { winner } = resolveConflict(existing.updatedAt, parsed.lastModified);
        if (winner === "server") {
          return successResult(bookId);
        }
      }

      await deps.upsertProgress({
        userId: device.userId,
        editionId: bookId,
        percent: parsed.progress,
        locator: parsed.location ? { koboLocation: parsed.location } : {},
        source: "kobo",
      });

      return successResult(bookId);
    }

    throw httpError("Method not allowed", 405);
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db, editionExists } = await import("@bookhouse/db");

  const handler = createStateHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    editionExists: (editionId) => editionExists(db, editionId),
    findProgress: async (userId, editionId) => {
      const record = await db.readingProgress.findFirst({
        where: { userId, editionId, progressKind: "EBOOK", source: "kobo" },
      });
      if (!record) return null;
      return {
        id: record.id,
        userId: record.userId,
        editionId: record.editionId,
        progressKind: record.progressKind,
        locator: record.locator as LocatorData,
        percent: record.percent,
        source: record.source,
        updatedAt: record.updatedAt,
      };
    },
    upsertProgress: async ({ userId, editionId, percent, locator, source }) => {
      const jsonLocator = locator as Prisma.InputJsonValue;
      // Atomic upsert keyed on the per-source unique constraint — avoids the
      // find-then-create race and never clobbers another source's row.
      const record = await db.readingProgress.upsert({
        where: {
          userId_editionId_progressKind_source: {
            userId,
            editionId,
            progressKind: "EBOOK",
            source,
          },
        },
        create: {
          userId,
          editionId,
          progressKind: "EBOOK",
          percent,
          locator: jsonLocator,
          source,
        },
        update: { percent, locator: jsonLocator },
      });

      return {
        id: record.id,
        userId: record.userId,
        editionId: record.editionId,
        progressKind: record.progressKind,
        locator: record.locator as LocatorData,
        percent: record.percent,
        source: record.source,
        updatedAt: record.updatedAt,
      };
    },
    getMethod: (ev) => ev.req.method,
    readBody: (ev) => readBody(ev),
  });

  return handler(event);
});
/* c8 ignore stop */
