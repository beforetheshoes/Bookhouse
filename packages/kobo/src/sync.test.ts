import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findEligibleEditions,
  computeSyncDiff,
  buildSyncResponse,
} from "./sync";
import type { FindEligibleEditionsDeps, SyncedBookRecord } from "./sync";
import type { EligibleEdition, ReadingProgressRecord } from "./types";
import type { MetadataOptions } from "./metadata";

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

describe("findEligibleEditions", () => {
  it("delegates to deps.getDeviceCollectionEditions", async () => {
    const editions = [makeEdition("e1"), makeEdition("e2")];
    const deps: FindEligibleEditionsDeps = {
      getDeviceCollectionEditions: vi.fn().mockResolvedValue(editions),
    };

    const result = await findEligibleEditions("device-1", deps);

    expect(result).toEqual(editions);
    expect(deps.getDeviceCollectionEditions).toHaveBeenCalledWith("device-1");
  });

  it("returns empty array when no editions found", async () => {
    const deps: FindEligibleEditionsDeps = {
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([]),
    };

    const result = await findEligibleEditions("device-1", deps);
    expect(result).toEqual([]);
  });

  it("filters out editions without an EPUB or KEPUB delivery file", async () => {
    const deps: FindEligibleEditionsDeps = {
      getDeviceCollectionEditions: vi.fn().mockResolvedValue([
        makeEdition("epub"),
        {
          ...makeEdition("pdf"),
          deliveryFilePath: "/books/pdf.pdf",
          deliveryFileMimeType: "application/pdf",
          deliveryFileMediaKind: "PDF",
        },
        {
          ...makeEdition("missing"),
          deliveryFilePath: null,
          deliveryFileMimeType: null,
          deliveryFileMediaKind: null,
        },
      ]),
    };

    const result = await findEligibleEditions("device-1", deps);

    expect(result.map((edition) => edition.id)).toEqual(["epub"]);
  });
});

describe("computeSyncDiff", () => {
  it("identifies new editions to add", () => {
    const eligible = [makeEdition("e1"), makeEdition("e2")];
    const synced: SyncedBookRecord[] = [];

    const { toAdd, toRemove } = computeSyncDiff(eligible, synced);
    expect(toAdd).toHaveLength(2);
    expect(toRemove).toHaveLength(0);
  });

  it("identifies editions to remove", () => {
    const eligible: EligibleEdition[] = [];
    const synced: SyncedBookRecord[] = [
      { editionId: "e1", removedAt: null },
    ];

    const { toAdd, toRemove } = computeSyncDiff(eligible, synced);
    expect(toAdd).toHaveLength(0);
    expect(toRemove).toEqual(["e1"]);
  });

  it("does not re-add already synced editions", () => {
    const eligible = [makeEdition("e1")];
    const synced: SyncedBookRecord[] = [
      { editionId: "e1", removedAt: null },
    ];

    const { toAdd, toRemove } = computeSyncDiff(eligible, synced);
    expect(toAdd).toHaveLength(0);
    expect(toRemove).toHaveLength(0);
  });

  it("skips already-removed books when computing removals", () => {
    const eligible: EligibleEdition[] = [];
    const synced: SyncedBookRecord[] = [
      { editionId: "e1", removedAt: new Date() },
    ];

    const diff = computeSyncDiff(eligible, synced);
    expect(diff.toRemove).toHaveLength(0);
  });

  it("handles mixed add and remove", () => {
    const eligible = [makeEdition("e2"), makeEdition("e3")];
    const synced: SyncedBookRecord[] = [
      { editionId: "e1", removedAt: null },
      { editionId: "e2", removedAt: null },
    ];

    const { toAdd, toRemove } = computeSyncDiff(eligible, synced);
    expect(toAdd.map((e) => e.id)).toEqual(["e3"]);
    expect(toRemove).toEqual(["e1"]);
  });
});

describe("buildSyncResponse", () => {
  const options: MetadataOptions = {
    baseUrl: "http://localhost:3000",
    deviceToken: "tok",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds entitlements for new editions", () => {
    const toAdd = [makeEdition("e1")];
    const result = buildSyncResponse(toAdd, [], options);
    expect(result.newEntitlements).toHaveLength(1);
    expect(result.newEntitlements.at(0)?.BookEntitlement.Id).toBe("e1");
  });

  it("includes removed IDs", () => {
    const result = buildSyncResponse([], ["e2", "e3"], options);
    expect(result.removedIds).toEqual(["e2", "e3"]);
  });

  it("handles empty inputs", () => {
    const result = buildSyncResponse([], [], options);
    expect(result.newEntitlements).toEqual([]);
    expect(result.removedIds).toEqual([]);
  });

  it("passes progress to entitlement when progressMap provided", () => {
    const toAdd = [makeEdition("e1")];
    const progressMap = new Map<string, ReadingProgressRecord>([
      ["e1", {
        id: "rp-1",
        userId: "u1",
        editionId: "e1",
        progressKind: "EBOOK",
        locator: {},
        percent: 65,
        source: "kobo",
        updatedAt: new Date("2024-07-01T00:00:00.000Z"),
      }],
    ]);
    const result = buildSyncResponse(toAdd, [], options, progressMap);
    expect(result.newEntitlements.at(0)?.ReadingState.StatusInfo.Status).toBe("Reading");
    expect(result.newEntitlements.at(0)?.ReadingState.CurrentBookmark.ProgressPercent).toBe(65);
  });

  it("falls back to ReadyToRead when edition not in progressMap", () => {
    const toAdd = [makeEdition("e1")];
    const progressMap = new Map<string, ReadingProgressRecord>();
    const result = buildSyncResponse(toAdd, [], options, progressMap);
    expect(result.newEntitlements.at(0)?.ReadingState.StatusInfo.Status).toBe("ReadyToRead");
  });

  it("returns changedReadingStates for progress entries with Location not in toAdd", () => {
    const koboLocation = { Source: "OEBPS/ch02.xhtml", Type: "KoboSpan", Value: "kobo.2.1" };
    const toAdd = [makeEdition("e1")];
    const progressMap = new Map<string, ReadingProgressRecord>([
      ["e1", {
        id: "rp-1", userId: "u1", editionId: "e1", progressKind: "EBOOK",
        locator: { koboLocation }, percent: 50, source: "kobo",
        updatedAt: new Date("2024-07-01T00:00:00.000Z"),
      }],
      ["e2", {
        id: "rp-2", userId: "u1", editionId: "e2", progressKind: "EBOOK",
        locator: { koboLocation }, percent: 75, source: "kobo",
        updatedAt: new Date("2024-07-01T00:00:00.000Z"),
      }],
    ]);
    const result = buildSyncResponse(toAdd, [], options, progressMap);
    // e1 is in toAdd so it goes in newEntitlements, not changedReadingStates
    expect(result.newEntitlements).toHaveLength(1);
    expect(result.changedReadingStates).toHaveLength(1);
    expect(result.changedReadingStates.at(0)?.EntitlementId).toBe("e2");
    expect(result.changedReadingStates.at(0)?.CurrentBookmark.ProgressPercent).toBe(75);
  });

  it("excludes progress without Location from changedReadingStates", () => {
    const progressMap = new Map<string, ReadingProgressRecord>([
      ["e1", {
        id: "rp-1", userId: "u1", editionId: "e1", progressKind: "EBOOK",
        locator: {}, percent: 50, source: "manual",
        updatedAt: new Date("2024-07-01T00:00:00.000Z"),
      }],
    ]);
    const result = buildSyncResponse([], [], options, progressMap);
    expect(result.changedReadingStates).toHaveLength(0);
  });

  it("returns empty changedReadingStates when all progress is in toAdd", () => {
    const toAdd = [makeEdition("e1")];
    const progressMap = new Map<string, ReadingProgressRecord>([
      ["e1", {
        id: "rp-1", userId: "u1", editionId: "e1", progressKind: "EBOOK",
        locator: {}, percent: 50, source: "kobo",
        updatedAt: new Date("2024-07-01T00:00:00.000Z"),
      }],
    ]);
    const result = buildSyncResponse(toAdd, [], options, progressMap);
    expect(result.changedReadingStates).toHaveLength(0);
  });

  it("returns empty changedReadingStates when no progressMap provided", () => {
    const result = buildSyncResponse([], [], options);
    expect(result.changedReadingStates).toHaveLength(0);
  });
});
