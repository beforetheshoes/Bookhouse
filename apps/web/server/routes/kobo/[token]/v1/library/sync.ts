import { defineEventHandler, getQuery, setResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../auth-helper";
import type { EligibleEdition } from "@bookhouse/kobo";
import type { SyncedBookRecord } from "@bookhouse/kobo";

const SYNC_ITEM_LIMIT = 100;

export interface SyncHandlerDeps {
  auth: KoboAuthDeps;
  getDeviceCollectionEditions: (deviceId: string) => Promise<EligibleEdition[]>;
  getSyncedBooks: (deviceId: string) => Promise<SyncedBookRecord[]>;
  markSynced: (deviceId: string, editionIds: string[]) => Promise<void>;
  markRemoved: (deviceId: string, editionIds: string[]) => Promise<void>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createSyncHandler(deps: SyncHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    const device = await auth(event);

    const query = getQuery(event);
    const filterParam = typeof query.Filter === "string" ? query.Filter : null;

    const { findEligibleEditions, computeSyncDiff, buildSyncResponse } = await import("@bookhouse/kobo");

    const eligible = await findEligibleEditions(device.id, {
      getDeviceCollectionEditions: deps.getDeviceCollectionEditions,
    });

    console.log(`[kobo] SYNC device=${device.id} eligible=${eligible.length}`);

    const synced = await deps.getSyncedBooks(device.id);

    console.log(`[kobo] SYNC synced=${synced.length} (active=${synced.filter((s) => s.removedAt === null).length})`);

    const { toAdd, toRemove } = computeSyncDiff(eligible, synced);

    console.log(`[kobo] SYNC toAdd=${toAdd.length} toRemove=${toRemove.length}`);

    // Paginate: only send up to SYNC_ITEM_LIMIT items per response
    const pageAdd = toAdd.slice(0, SYNC_ITEM_LIMIT);
    const additionsRemaining = toAdd.length > SYNC_ITEM_LIMIT;
    const pageRemove = additionsRemaining ? [] : toRemove;

    const baseUrl = deps.getBaseUrl();
    const result = buildSyncResponse(pageAdd, pageRemove, {
      baseUrl,
      deviceToken: device.authToken,
    });

    if (pageAdd.length > 0) {
      await deps.markSynced(
        device.id,
        pageAdd.map((e) => e.id),
      );
    }

    if (pageRemove.length > 0) {
      await deps.markRemoved(device.id, pageRemove);
    }

    // Build response array
    const syncResults: Record<string, unknown>[] = [];

    for (const entitlement of result.newEntitlements) {
      syncResults.push({ NewEntitlement: entitlement });
    }

    for (const id of result.removedIds) {
      syncResults.push({
        ChangedEntitlement: {
          BookEntitlement: { Id: id, IsRemoved: true },
        },
      });
    }

    // One-time cleanup: remove legacy UUID-format entries from old syncs
    // that used toKoboId(editionId) instead of raw edition IDs.
    const { toKoboId } = await import("@bookhouse/kobo");
    for (const edition of eligible) {
      const legacyId = toKoboId(edition.id);
      syncResults.push({
        ChangedEntitlement: {
          BookEntitlement: { Id: legacyId, IsRemoved: true },
        },
      });
    }

    // Build sync token for response header
    const nowEpoch = Math.floor(Date.now() / 1000);
    const tokenData = {
      version: "1-1-0",
      data: {
        raw_kobo_store_token: "",
        books_last_created: nowEpoch,
        books_last_modified: nowEpoch,
        archive_last_modified: nowEpoch,
        reading_state_last_modified: nowEpoch,
        tags_last_modified: nowEpoch,
      },
    };
    const encodedToken = Buffer.from(JSON.stringify(tokenData)).toString("base64");
    deps.setResponseHeader(event, "x-kobo-synctoken", encodedToken);

    // If more items remain, tell the Kobo to request another sync
    const hasMore = additionsRemaining;
    if (hasMore) {
      deps.setResponseHeader(event, "x-kobo-sync", "continue");
      console.log(`[kobo] SYNC paginated: sent ${pageAdd.length}, ${toAdd.length - pageAdd.length} remaining`);
    }

    // Log first entitlement for diagnostics (only on first page)
    if (syncResults.length > 0 && synced.length === 0) {
      console.log(`[kobo] SYNC first entitlement sample: ${JSON.stringify(syncResults[0])}`);
    }

    console.log(`[kobo] SYNC response: ${syncResults.length} items (filter=${filterParam ?? "none"})`);

    return syncResults;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createSyncHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    getDeviceCollectionEditions: async (deviceId) => {
      console.log(`[kobo] QUERY deviceCollections for deviceId=${deviceId}`);
      const deviceCollections = await db.koboDeviceCollection.findMany({
        where: { koboDeviceId: deviceId },
        include: {
          collection: {
            include: {
              items: {
                include: {
                  edition: {
                    include: {
                      work: { include: { series: true } },
                      contributors: { include: { contributor: true } },
                      editionFiles: {
                        where: { role: "PRIMARY" },
                        include: { fileAsset: true },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      console.log(`[kobo] QUERY found ${deviceCollections.length} deviceCollections, items: ${deviceCollections.map((dc) => dc.collection.items.length).join(",")}`);

      const editionMap = new Map<string, EligibleEdition>();

      for (const dc of deviceCollections) {
        for (const item of dc.collection.items) {
          const ed = item.edition;
          if (editionMap.has(ed.id)) continue;

          const primaryFile = ed.editionFiles[0]?.fileAsset ?? null;
          editionMap.set(ed.id, {
            id: ed.id,
            workId: ed.workId,
            title: ed.work.titleDisplay,
            description: ed.work.description,
            coverPath: ed.work.coverPath,
            publisher: ed.publisher,
            publishedAt: ed.publishedAt,
            isbn13: ed.isbn13,
            language: ed.language,
            pageCount: ed.pageCount,
            seriesName: ed.work.series?.name ?? null,
            seriesPosition: ed.work.seriesPosition,
            contributors: ed.contributors.map((c) => ({
              name: c.contributor.nameDisplay,
              role: c.role,
            })),
            primaryFilePath: primaryFile?.absolutePath ?? null,
            primaryFileSize: primaryFile?.sizeBytes ? Number(primaryFile.sizeBytes) : null,
            primaryFileMimeType: primaryFile?.mimeType ?? null,
          });
        }
      }

      return Array.from(editionMap.values());
    },
    getSyncedBooks: async (deviceId) => {
      const records = await db.koboSyncedBook.findMany({
        where: { koboDeviceId: deviceId },
      });
      return records.map((r) => ({
        editionId: r.editionId,
        removedAt: r.removedAt,
      }));
    },
    markSynced: async (deviceId, editionIds) => {
      for (const editionId of editionIds) {
        await db.koboSyncedBook.upsert({
          where: {
            koboDeviceId_editionId: { koboDeviceId: deviceId, editionId },
          },
          create: { koboDeviceId: deviceId, editionId },
          update: { removedAt: null, syncedAt: new Date() },
        });
      }
    },
    markRemoved: async (deviceId, editionIds) => {
      await db.koboSyncedBook.updateMany({
        where: { koboDeviceId: deviceId, editionId: { in: editionIds } },
        data: { removedAt: new Date() },
      });
    },
    getBaseUrl: () => process.env.KOBO_API_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader,
  });

  return handler(event);
});
/* c8 ignore stop */
