import { describe, expect, it, vi } from "vitest";
import type { ShelfBooksHandlerDeps } from "./[collectionId]";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  defineEventHandler: vi.fn(),
}));

// Must import after mock
const { createShelfBooksHandler } = await import("./[collectionId]");

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

function makeEvent(collectionId: string): H3Event {
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
    context: { params: { collectionId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<ShelfBooksHandlerDeps> = {}): ShelfBooksHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getShelfEditions: vi.fn().mockResolvedValue([makeEdition("1"), makeEdition("2")]),
    getShelfName: vi.fn().mockResolvedValue("Favorites"),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createShelfBooksHandler", () => {
  it("returns an acquisition feed with books in the shelf", async () => {
    const deps = makeDeps();
    const handler = createShelfBooksHandler(deps);
    const xml = (await handler(makeEvent("s1"))) as string;

    expect(xml).toContain("<title>Favorites</title>");
    expect(xml).toContain("<title>Book 1</title>");
    expect(xml).toContain("<title>Book 2</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createShelfBooksHandler(deps);
    await handler(makeEvent("s1"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createShelfBooksHandler(deps);
    await handler(makeEvent("s1"));

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("passes userId to getShelfName and getShelfEditions", async () => {
    const deps = makeDeps();
    const handler = createShelfBooksHandler(deps);
    await handler(makeEvent("s1"));

    expect(deps.getShelfName).toHaveBeenCalledWith("s1", "user-1");
    expect(deps.getShelfEditions).toHaveBeenCalledWith("s1", "user-1");
  });

  it("returns 404 for unknown shelf", async () => {
    const deps = makeDeps({
      getShelfName: vi.fn().mockResolvedValue(null),
    });
    const handler = createShelfBooksHandler(deps);

    await expect(handler(makeEvent("unknown-id"))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Shelf not found",
    });
  });

  it("throws 400 for invalid collectionId format", async () => {
    const deps = makeDeps();
    const handler = createShelfBooksHandler(deps);

    await expect(handler(makeEvent("bad/id"))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Invalid collectionId",
    });
  });

  it("returns empty feed when shelf has no editions", async () => {
    const deps = makeDeps({
      getShelfEditions: vi.fn().mockResolvedValue([]),
    });
    const handler = createShelfBooksHandler(deps);
    const xml = (await handler(makeEvent("s1"))) as string;

    expect(xml).toContain("<title>Favorites</title>");
    expect(xml).not.toContain("<entry>");
  });
});
