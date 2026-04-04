import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSyncHandler } from "./sync";
import type { SyncHandlerDeps } from "./sync";
import type { H3Event } from "h3";
import type { EligibleEdition, ReadingProgressRecord } from "@bookhouse/kobo";

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

const makeEdition = (id: string): EligibleEdition => ({
  id,
  workId: `wk-${id}`,
  title: `Book ${id}`,
  description: null,
  coverPath: null,
  publisher: null,
  publishedAt: null,
  isbn13: null,
  language: null,
  pageCount: null,
  seriesName: null,
  seriesPosition: null,
  contributors: [],
  deliveryFilePath: `/books/${id}.epub`,
  deliveryFileSize: 1000,
  deliveryFileMimeType: "application/epub+zip",
  deliveryFileMediaKind: "EPUB",
});

function makeEvent(filter?: string): H3Event {
  return {
    context: { params: { token: validToken } },
    _query: filter ? { Filter: filter } : {},
  } as unknown as H3Event;
}

vi.mock("h3", () => ({
  getQuery: (event: { _query?: Record<string, string> }) => event._query ?? {},
  defineEventHandler: vi.fn(),
}));

function makeDeps(overrides: Partial<SyncHandlerDeps> = {}): SyncHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    getDeviceCollectionEditions: vi.fn().mockResolvedValue([]),
    getSyncedBooks: vi.fn().mockResolvedValue([]),
    markSynced: vi.fn().mockResolvedValue(undefined),
    markRemoved: vi.fn().mockResolvedValue(undefined),
    getReadingProgress: vi.fn().mockResolvedValue([]),
    getBaseUrl: () => "http://localhost:3000",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createSyncHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty array when no editions or synced books", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent()) as Record<string, unknown>[];

    expect(result).toEqual([]);
  });

  it("sets x-kobo-synctoken header with nested data structure", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    const calls = (deps.setResponseHeader as ReturnType<typeof vi.fn>).mock.calls;
    const synctokenCall = calls.find((c: unknown[]) => c[1] === "x-kobo-synctoken");
    expect(synctokenCall).toBeDefined();
    const decoded = JSON.parse(Buffer.from(synctokenCall![2] as string, "base64").toString());
    expect(decoded.version).toBe("1-1-0");
    expect(decoded.data).toBeDefined();
    expect(typeof decoded.data.books_last_modified).toBe("number");
    expect(decoded.data.raw_kobo_store_token).toBe("");
  });

  it("does not set x-kobo-apitoken header on sync response", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    const calls = (deps.setResponseHeader as ReturnType<typeof vi.fn>).mock.calls;
    const apitokenCall = calls.find((c: unknown[]) => c[1] === "x-kobo-apitoken");
    expect(apitokenCall).toBeUndefined();
  });

  it("returns NewEntitlement items for unsynced editions", async () => {
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent()) as Record<string, unknown>[];

    // 1 NewEntitlement + 1 legacy UUID removal
    expect(result).toHaveLength(2);
    const item = result.at(0) as { NewEntitlement: { BookEntitlement: { Id: string } } };
    expect(item.NewEntitlement.BookEntitlement.Id).toBe("e1");
    const removal = result.at(1) as { ChangedEntitlement: { BookEntitlement: { Id: string; IsRemoved: boolean } } };
    expect(removal.ChangedEntitlement.BookEntitlement.IsRemoved).toBe(true);
    expect(deps.markSynced).toHaveBeenCalledWith("d1", ["e1"]);
  });

  it("returns ChangedEntitlement for no-longer-eligible books", async () => {
    const deps = makeDeps({
      getSyncedBooks: vi
        .fn()
        .mockResolvedValue([{ editionId: "e1", removedAt: null }]),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent()) as Record<string, unknown>[];

    expect(result).toHaveLength(1);
    const item = result.at(0) as { ChangedEntitlement: { BookEntitlement: { Id: string; IsRemoved: boolean } } };
    expect(item.ChangedEntitlement.BookEntitlement.Id).toBe("e1");
    expect(item.ChangedEntitlement.BookEntitlement.IsRemoved).toBe(true);
    expect(deps.markRemoved).toHaveBeenCalledWith("d1", ["e1"]);
  });

  it("does not call markSynced when no additions", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    expect(deps.markSynced).not.toHaveBeenCalled();
  });

  it("does not call markRemoved when no removals", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    expect(deps.markRemoved).not.toHaveBeenCalled();
  });

  it("accepts a sync token filter parameter", async () => {
    const { encodeSyncToken } = await import("@bookhouse/kobo");
    const token = encodeSyncToken({
      lastSyncAt: "2024-06-01T00:00:00.000Z",
      archive: true,
    });

    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent(token)) as Record<string, unknown>[];

    expect(result).toEqual([]);
  });

  it("handles null filter parameter", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    const event = {
      context: { params: { token: validToken } },
      _query: { Filter: 123 },
    } as unknown as H3Event;
    const result = await handler(event) as Record<string, unknown>[];

    expect(result).toEqual([]);
  });

  it("sets x-kobo-sync: continue header when more than 100 editions pending", async () => {
    const editions = Array.from({ length: 101 }, (_, i) => makeEdition(`e${i}`));
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue(editions),
    });
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "x-kobo-sync",
      "continue",
    );
    expect(deps.markSynced).toHaveBeenCalledWith(
      "d1",
      expect.arrayContaining([expect.any(String)]),
    );
    // Only 100 items sent in this page
    const [, editionIds] = (deps.markSynced as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
    expect(editionIds).toHaveLength(100);
  });

  it("fetches reading progress for eligible editions", async () => {
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1"), makeEdition("e2")]),
    });
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    expect(deps.getReadingProgress).toHaveBeenCalledWith("u1", ["e1", "e2"]);
  });

  it("includes ChangedReadingState for already-synced books with Location", async () => {
    const progressRecords: ReadingProgressRecord[] = [{
      id: "rp-1",
      userId: "u1",
      editionId: "e1",
      progressKind: "EBOOK",
      locator: { koboLocation: { Source: "OEBPS/ch01.xhtml", Type: "KoboSpan", Value: "kobo.1.1" } },
      percent: 42,
      source: "kobo",
      updatedAt: new Date("2024-07-01T00:00:00.000Z"),
    }];
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
      getSyncedBooks: vi.fn().mockResolvedValue([{ editionId: "e1", removedAt: null }]),
      getReadingProgress: vi.fn().mockResolvedValue(progressRecords),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent()) as Record<string, unknown>[];

    const changedStates = result.filter(
      (r) => "ChangedReadingState" in r,
    ) as { ChangedReadingState: { ReadingState: { EntitlementId: string; CurrentBookmark: { ProgressPercent: number } } } }[];
    expect(changedStates).toHaveLength(1);
    expect(changedStates.at(0)?.ChangedReadingState.ReadingState.EntitlementId).toBe("e1");
    expect(changedStates.at(0)?.ChangedReadingState.ReadingState.CurrentBookmark.ProgressPercent).toBe(42);
  });

  it("includes reading state in NewEntitlement when progress exists", async () => {
    const progressRecords: ReadingProgressRecord[] = [{
      id: "rp-1",
      userId: "u1",
      editionId: "e1",
      progressKind: "EBOOK",
      locator: {},
      percent: 75,
      source: "kobo",
      updatedAt: new Date("2024-07-01T00:00:00.000Z"),
    }];
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
      getReadingProgress: vi.fn().mockResolvedValue(progressRecords),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent()) as Record<string, unknown>[];

    const item = result.at(0) as { NewEntitlement: { ReadingState: { StatusInfo: { Status: string }; CurrentBookmark: { ProgressPercent: number } } } };
    expect(item.NewEntitlement.ReadingState.StatusInfo.Status).toBe("Reading");
    expect(item.NewEntitlement.ReadingState.CurrentBookmark.ProgressPercent).toBe(75);
  });
});
