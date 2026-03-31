import { defineEventHandler, getMethod, readBody } from "h3";
import type { H3Event } from "h3";
import type { Prisma } from "@bookhouse/db";
import type { KoboAuthDeps } from "../../../../auth-helper";
import type { ReadingProgressRecord, KoboReadingState, KoboRequestResult, LocatorData, KoboLocation } from "@bookhouse/kobo";

export interface StateHandlerDeps {
  auth: KoboAuthDeps;
  findProgress: (userId: string, editionId: string) => Promise<ReadingProgressRecord | null>;
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
      throw Object.assign(new Error("Invalid bookId"), {
        statusCode: 400,
        statusMessage: "Invalid bookId",
      });
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
        throw Object.assign(new Error(parsed.error), {
          statusCode: 400,
          statusMessage: parsed.error,
        });
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

    throw Object.assign(new Error("Method not allowed"), {
      statusCode: 405,
      statusMessage: "Method not allowed",
    });
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createStateHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    findProgress: async (userId, editionId) => {
      const record = await db.readingProgress.findFirst({
        where: { userId, editionId, progressKind: "EBOOK" },
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
      const existing = await db.readingProgress.findFirst({
        where: { userId, editionId, progressKind: "EBOOK" },
      });

      const jsonLocator = locator as Prisma.InputJsonValue;
      const record = existing
        ? await db.readingProgress.update({
            where: { id: existing.id },
            data: { percent, locator: jsonLocator, source },
          })
        : await db.readingProgress.create({
            data: {
              userId,
              editionId,
              progressKind: "EBOOK",
              percent,
              locator: jsonLocator,
              source,
            },
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
    getMethod: (ev) => getMethod(ev),
    readBody: (ev) => readBody(ev),
  });

  return handler(event);
});
/* c8 ignore stop */
