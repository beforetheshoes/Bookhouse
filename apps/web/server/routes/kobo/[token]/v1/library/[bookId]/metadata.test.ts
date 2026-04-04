import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMetadataHandler } from "./metadata";
import type { MetadataHandlerDeps } from "./metadata";
import type { H3Event } from "h3";
import type { EligibleEdition, KoboBookMetadata } from "@bookhouse/kobo";

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

const mockEdition: EligibleEdition = {
  id: "ed-1",
  workId: "wk-1",
  title: "Test Book",
  description: "Desc",
  coverPath: null,
  publisher: "Pub",
  publishedAt: new Date("2024-01-01"),
  isbn13: null,
  language: "en",
  pageCount: 200,
  seriesName: null,
  seriesPosition: null,
  contributors: [{ name: "Author", role: "AUTHOR" }],
  deliveryFilePath: "/books/test.epub",
  deliveryFileSize: 1000,
  deliveryFileMimeType: "application/epub+zip",
  deliveryFileMediaKind: "EPUB",
};

function makeEvent(bookId = "ed-1"): H3Event {
  return {
    context: { params: { token: validToken, bookId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<MetadataHandlerDeps> = {}): MetadataHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    findEdition: vi.fn().mockResolvedValue(mockEdition),
    getBaseUrl: () => "http://localhost:3000",
    ...overrides,
  };
}

describe("createMetadataHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns metadata array for valid edition", async () => {
    const deps = makeDeps();
    const handler = createMetadataHandler(deps);
    const result = await handler(makeEvent()) as KoboBookMetadata[];

    expect(result).toHaveLength(1);
    expect(result.at(0)?.Title).toBe("Test Book");
    expect(result.at(0)?.EntitlementId).toBe("ed-1");
  });

  it("throws 400 for invalid bookId", async () => {
    const deps = makeDeps();
    const handler = createMetadataHandler(deps);

    try {
      await handler(makeEvent("../../../etc"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(400);
    }
  });

  it("returns array with empty object when edition not found", async () => {
    const deps = makeDeps({
      findEdition: vi.fn().mockResolvedValue(null),
    });
    const handler = createMetadataHandler(deps);
    const result = await handler(makeEvent());
    expect(result).toEqual([{}]);
  });

  it("throws when auth fails", async () => {
    const deps = makeDeps({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
    });
    const handler = createMetadataHandler(deps);

    await expect(handler(makeEvent())).rejects.toThrow();
  });
});
