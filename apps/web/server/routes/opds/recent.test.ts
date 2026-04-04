import { describe, expect, it, vi } from "vitest";
import type { RecentHandlerDeps } from "./recent";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  getRequestHeader: (event: { _authorization?: string }, _name: string) =>
    event._authorization,
  defineEventHandler: vi.fn(),
}));

const { createRecentHandler } = await import("./recent");

const mockCredential = {
  id: "cred-1",
  userId: "user-1",
  username: "reader",
  passwordHash: "salt:hash",
  isEnabled: true,
};

function makeEdition(id: string): OpdsEditionData {
  return {
    editionId: id,
    workId: `work-${id}`,
    titleDisplay: `Book ${id}`,
    sortTitle: null,
    description: null,
    coverPath: null,
    publisher: null,
    publishedAt: null,
    isbn13: null,
    language: null,
    seriesName: null,
    seriesPosition: null,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
    contributors: [],
    files: [
      { editionFileId: `ef-${id}`, mimeType: "application/epub+zip", sizeBytes: 1000n, basename: "book.epub" },
    ],
  };
}

function makeEvent(): H3Event {
  return {
    _authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
    path: "/opds/recent",
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<RecentHandlerDeps> = {}): RecentHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getRecentEditions: vi.fn().mockResolvedValue([makeEdition("1"), makeEdition("2")]),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createRecentHandler", () => {
  it("returns an acquisition feed with recent entries", async () => {
    const deps = makeDeps();
    const handler = createRecentHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Recently Added</title>");
    expect(xml).toContain("<title>Book 1</title>");
    expect(xml).toContain("<title>Book 2</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createRecentHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("requests 50 recent editions", async () => {
    const deps = makeDeps();
    const handler = createRecentHandler(deps);
    await handler(makeEvent());

    expect(deps.getRecentEditions).toHaveBeenCalledWith(50);
  });

  it("does not include pagination", async () => {
    const deps = makeDeps();
    const handler = createRecentHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).not.toContain("opensearch:totalResults");
  });

  it("returns empty feed for empty library", async () => {
    const deps = makeDeps({
      getRecentEditions: vi.fn().mockResolvedValue([]),
    });
    const handler = createRecentHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Recently Added</title>");
    expect(xml).not.toContain("<entry>");
  });
});
