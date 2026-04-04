import { describe, expect, it, vi } from "vitest";
import type { AllBooksHandlerDeps } from "./all";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  getQuery: (event: { _query?: Record<string, string> }) => event._query ?? {},
  defineEventHandler: vi.fn(),
}));

// Must import after mock
const { createAllBooksHandler } = await import("./all");

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

function makeEvent(page?: string): H3Event {
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
    _query: page ? { page } : {},
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<AllBooksHandlerDeps> = {}): AllBooksHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getEditions: vi.fn().mockResolvedValue([makeEdition("1"), makeEdition("2")]),
    countEditions: vi.fn().mockResolvedValue(2),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createAllBooksHandler", () => {
  it("returns an acquisition feed with entries", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>All Books</title>");
    expect(xml).toContain("<title>Book 1</title>");
    expect(xml).toContain("<title>Book 2</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("passes page 1 by default with correct skip/take", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    await handler(makeEvent());

    expect(deps.getEditions).toHaveBeenCalledWith({ skip: 0, take: 25 });
  });

  it("passes correct skip for page 2", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    await handler(makeEvent("2"));

    expect(deps.getEditions).toHaveBeenCalledWith({ skip: 25, take: 25 });
  });

  it("includes pagination when there are more results", async () => {
    const deps = makeDeps({
      getEditions: vi.fn().mockResolvedValue(Array.from({ length: 25 }, (_, i) => makeEdition(String(i)))),
      countEditions: vi.fn().mockResolvedValue(50),
    });
    const handler = createAllBooksHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('rel="next"');
    expect(xml).toContain("<opensearch:totalResults>50</opensearch:totalResults>");
  });

  it("defaults to page 1 for invalid page param", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    await handler(makeEvent("abc"));

    expect(deps.getEditions).toHaveBeenCalledWith({ skip: 0, take: 25 });
  });

  it("defaults to page 1 for negative page param", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    await handler(makeEvent("-1"));

    expect(deps.getEditions).toHaveBeenCalledWith({ skip: 0, take: 25 });
  });

  it("returns empty feed for empty library", async () => {
    const deps = makeDeps({
      getEditions: vi.fn().mockResolvedValue([]),
      countEditions: vi.fn().mockResolvedValue(0),
    });
    const handler = createAllBooksHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>All Books</title>");
    expect(xml).not.toContain("<entry>");
  });

  it("includes search link", async () => {
    const deps = makeDeps();
    const handler = createAllBooksHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('rel="search"');
  });
});
