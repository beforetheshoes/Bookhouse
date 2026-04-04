import { describe, expect, it, vi } from "vitest";
import type { SearchHandlerDeps } from "./search";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  getQuery: (event: { _query?: Record<string, string> }) => event._query ?? {},
  defineEventHandler: vi.fn(),
}));

const { createSearchHandler } = await import("./search");

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

function makeEvent(q?: string, page?: string): H3Event {
  const query: Record<string, string> = {};
  if (q != null) query.q = q;
  if (page != null) query.page = page;
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
    _query: query,
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<SearchHandlerDeps> = {}): SearchHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    searchEditions: vi.fn().mockResolvedValue([makeEdition("1")]),
    countSearchResults: vi.fn().mockResolvedValue(1),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createSearchHandler", () => {
  it("returns search results for a query", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    const xml = (await handler(makeEvent("fantasy"))) as string;

    expect(xml).toContain("<title>Search: fantasy</title>");
    expect(xml).toContain("<title>Book 1</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    await handler(makeEvent("test"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("passes query and pagination to searchEditions", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    await handler(makeEvent("fantasy", "2"));

    expect(deps.searchEditions).toHaveBeenCalledWith("fantasy", { skip: 25, take: 25 });
  });

  it("returns empty feed for missing query param", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Search Results</title>");
    expect(xml).not.toContain("<entry>");
    expect(deps.searchEditions).not.toHaveBeenCalled();
  });

  it("returns empty feed for blank query", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    const xml = (await handler(makeEvent("  "))) as string;

    expect(xml).not.toContain("<entry>");
    expect(deps.searchEditions).not.toHaveBeenCalled();
  });

  it("includes pagination for multiple pages of results", async () => {
    const deps = makeDeps({
      searchEditions: vi.fn().mockResolvedValue(Array.from({ length: 25 }, (_, i) => makeEdition(String(i)))),
      countSearchResults: vi.fn().mockResolvedValue(50),
    });
    const handler = createSearchHandler(deps);
    const xml = (await handler(makeEvent("test"))) as string;

    expect(xml).toContain('rel="next"');
    expect(xml).toContain("<opensearch:totalResults>50</opensearch:totalResults>");
  });

  it("defaults to page 1 for invalid page param", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    await handler(makeEvent("test", "abc"));

    expect(deps.searchEditions).toHaveBeenCalledWith("test", { skip: 0, take: 25 });
  });

  it("defaults to page 1 for negative page param", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    await handler(makeEvent("test", "-1"));

    expect(deps.searchEditions).toHaveBeenCalledWith("test", { skip: 0, take: 25 });
  });

  it("returns empty feed when search finds no results", async () => {
    const deps = makeDeps({
      searchEditions: vi.fn().mockResolvedValue([]),
      countSearchResults: vi.fn().mockResolvedValue(0),
    });
    const handler = createSearchHandler(deps);
    const xml = (await handler(makeEvent("nonexistent"))) as string;

    expect(xml).toContain("<title>Search: nonexistent</title>");
    expect(xml).not.toContain("<entry>");
  });

  it("URL-encodes the query in feed id and selfHref", async () => {
    const deps = makeDeps();
    const handler = createSearchHandler(deps);
    const xml = (await handler(makeEvent("a & b"))) as string;

    expect(xml).toContain("urn:bookhouse:search:a%20%26%20b");
  });
});
