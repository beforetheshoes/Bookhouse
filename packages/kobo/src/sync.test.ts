import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findEligibleEditions,
  computeSyncDiff,
  buildSyncResponse,
} from "./sync";
import type { FindEligibleEditionsDeps, SyncedBookRecord } from "./sync";
import type { EligibleEdition } from "./types";
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
  primaryFilePath: `/books/${id}.epub`,
  primaryFileSize: 1000,
  primaryFileMimeType: "application/epub+zip",
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
});
