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

function makeEvent(filter?: string, syncToken: string | null = null): H3Event {
  return {
    context: { params: { token: validToken } },
    req: { headers: { get: (name: string) => (name.toLowerCase() === "x-kobo-synctoken" ? syncToken : null) } },
    _query: filter ? { Filter: filter } : {},
  } as never;
}

/** The token a device would echo back after receiving a page. */
function tokenWithPending(pending: { added?: string[]; removed?: string[] }): string {
  return Buffer.from(JSON.stringify({ version: "1-1-0", data: {}, bookhouse: pending })).toString("base64");
}

function pendingIn(deps: SyncHandlerDeps): { added?: string[]; removed?: string[] } | undefined {
  const call = (deps.setResponseHeader as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1] === "x-kobo-synctoken");
  const decoded = JSON.parse(Buffer.from(call?.[2] as string, "base64").toString("utf8")) as { bookhouse?: { added?: string[]; removed?: string[] } };
  return decoded.bookhouse;
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
    getLegacyCleanupPending: vi.fn().mockResolvedValue(true),
    markLegacyCleanupDone: vi.fn().mockResolvedValue(undefined),
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
    const result = await handler(makeEvent());

    expect(result).toEqual([]);
  });

  it("sets x-kobo-synctoken header with nested data structure", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    const calls = (deps.setResponseHeader as ReturnType<typeof vi.fn>).mock.calls as [object, string, string][];
    const synctokenCall = calls.find((c) => c[1] === "x-kobo-synctoken");
    expect(synctokenCall).toBeDefined();
    const decoded = JSON.parse(Buffer.from(synctokenCall?.[2] ?? "", "base64").toString()) as {
      version: string;
      data: { books_last_modified: number; raw_kobo_store_token: string };
    };
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
    const apitokenCall = calls.find((c: string[]) => c[1] === "x-kobo-apitoken");
    expect(apitokenCall).toBeUndefined();
  });

  it("returns NewEntitlement items for unsynced editions", async () => {
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent());

    // 1 NewEntitlement + 1 legacy UUID removal (cleanup pending)
    expect(result).toHaveLength(2);
    const item = result.at(0) as { NewEntitlement: { BookEntitlement: { Id: string } } };
    expect(item.NewEntitlement.BookEntitlement.Id).toBe("e1");
    const removal = result.at(1) as { ChangedEntitlement: { BookEntitlement: { Id: string; IsRemoved: boolean } } };
    expect(removal.ChangedEntitlement.BookEntitlement.IsRemoved).toBe(true);
    // Not recorded yet: the device has to echo the token first.
    expect(deps.markSynced).not.toHaveBeenCalled();
    expect(pendingIn(deps)).toEqual({ added: ["e1"], removed: [] });
    // Legacy cleanup runs once and is recorded for the device.
    expect(deps.markLegacyCleanupDone).toHaveBeenCalledWith("d1");
  });

  it("skips legacy UUID cleanup once the device has been cleaned", async () => {
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
      getLegacyCleanupPending: vi.fn().mockResolvedValue(false),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent());

    // Only the NewEntitlement — no legacy removal re-sent.
    expect(result).toHaveLength(1);
    expect(result.at(0)).toHaveProperty("NewEntitlement");
    expect(deps.markLegacyCleanupDone).not.toHaveBeenCalled();
  });

  it("does not mark legacy cleanup done when there are no eligible editions", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    await handler(makeEvent());

    expect(deps.markLegacyCleanupDone).not.toHaveBeenCalled();
  });

  it("returns ChangedEntitlement for no-longer-eligible books", async () => {
    const deps = makeDeps({
      getSyncedBooks: vi
        .fn()
        .mockResolvedValue([{ editionId: "e1", removedAt: null }]),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent());

    expect(result).toHaveLength(1);
    const item = result.at(0) as { ChangedEntitlement: { BookEntitlement: { Id: string; IsRemoved: boolean } } };
    expect(item.ChangedEntitlement.BookEntitlement.Id).toBe("e1");
    expect(item.ChangedEntitlement.BookEntitlement.IsRemoved).toBe(true);
    expect(deps.markRemoved).not.toHaveBeenCalled();
    expect(pendingIn(deps)).toEqual({ added: [], removed: ["e1"] });
  });

  it("records a page as delivered only once the device echoes the token that carried it", async () => {
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
      getSyncedBooks: vi.fn().mockResolvedValue([{ editionId: "e1", removedAt: null }]),
    });
    const handler = createSyncHandler(deps);

    await handler(makeEvent(undefined, tokenWithPending({ added: ["e1"], removed: ["e0"] })));

    expect(deps.markSynced).toHaveBeenCalledWith("d1", ["e1"]);
    expect(deps.markRemoved).toHaveBeenCalledWith("d1", ["e0"]);
    // Nothing new to send, so no delivery is carried in the fresh token.
    expect(pendingIn(deps)).toBeUndefined();
  });

  it("re-sends a page whose token never came back", async () => {
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
    });
    const handler = createSyncHandler(deps);

    // The previous response was lost: the device still holds an older token.
    const result = await handler(makeEvent(undefined, tokenWithPending({})));

    expect(result.at(0)).toHaveProperty("NewEntitlement");
    expect(deps.markSynced).not.toHaveBeenCalled();
  });

  it("ignores tokens it did not mint", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);

    await handler(makeEvent(undefined, "not-base64-json"));
    await handler(makeEvent(undefined, Buffer.from(JSON.stringify({ bookhouse: { added: [1, "x"] } })).toString("base64")));

    expect(deps.markSynced).toHaveBeenCalledWith("d1", ["x"]);
    expect(deps.markRemoved).not.toHaveBeenCalled();
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
    const result = await handler(makeEvent(token));

    expect(result).toEqual([]);
  });

  it("handles null filter parameter", async () => {
    const deps = makeDeps();
    const handler = createSyncHandler(deps);
    const event = {
      context: { params: { token: validToken } },
      req: { headers: { get: () => null } },
      _query: { Filter: 123 },
    } as never;
    const result = await handler(event);

    expect(result).toEqual([]);
  });

  it("sets x-kobo-sync: continue header when more than 100 editions pending", async () => {
    const editions = Array.from({ length: 101 }, (_, i) => makeEdition(`e${String(i)}`));
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
    // Only 100 items sent in this page, carried in the token for the device to confirm.
    expect(pendingIn(deps)?.added).toHaveLength(100);
    expect(deps.markSynced).not.toHaveBeenCalled();
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
    const result = await handler(makeEvent());

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
    const result = await handler(makeEvent());

    const item = result.at(0) as { NewEntitlement: { ReadingState: { StatusInfo: { Status: string }; CurrentBookmark: { ProgressPercent: number } } } };
    expect(item.NewEntitlement.ReadingState.StatusInfo.Status).toBe("Reading");
    expect(item.NewEntitlement.ReadingState.CurrentBookmark.ProgressPercent).toBe(75);
  });

  it("continues without 500 when confirming a delivery hits a foreign-key violation", async () => {
    const fkError = Object.assign(new Error("FK failed"), { code: "P2003" });
    const deps = makeDeps({
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([makeEdition("e1")]),
      markSynced: vi.fn().mockRejectedValue(fkError),
    });
    const handler = createSyncHandler(deps);
    const result = await handler(makeEvent(undefined, tokenWithPending({ added: ["e-deleted"] })));

    // The sync still answers; the deleted edition simply isn't recorded.
    expect(result.at(0)).toHaveProperty("NewEntitlement");
  });

  it("rethrows non-foreign-key errors from markSynced", async () => {
    const deps = makeDeps({
      markSynced: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const handler = createSyncHandler(deps);

    await expect(handler(makeEvent(undefined, tokenWithPending({ added: ["e1"] })))).rejects.toThrow("db down");
  });
});
