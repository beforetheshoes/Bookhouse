import { describe, expect, it, vi } from "vitest";
import type { AuthorBooksHandlerDeps } from "./[contributorId]";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  getRequestHeader: (event: { _authorization?: string }, _name: string) =>
    event._authorization,
  defineEventHandler: vi.fn(),
}));

// Must import after mock
const { createAuthorBooksHandler } = await import("./[contributorId]");

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
    contributors: [{ name: "Jane Austen", role: "AUTHOR" }],
    files: [
      { editionFileId: `ef-${id}`, mimeType: "application/epub+zip", sizeBytes: 1000n, basename: "book.epub" },
    ],
  };
}

function makeEvent(contributorId: string): H3Event {
  return {
    _authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
    context: { params: { contributorId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<AuthorBooksHandlerDeps> = {}): AuthorBooksHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getAuthorEditions: vi.fn().mockResolvedValue([makeEdition("1"), makeEdition("2")]),
    getAuthorName: vi.fn().mockResolvedValue("Jane Austen"),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createAuthorBooksHandler", () => {
  it("returns an acquisition feed with books by the author", async () => {
    const deps = makeDeps();
    const handler = createAuthorBooksHandler(deps);
    const xml = (await handler(makeEvent("a1"))) as string;

    expect(xml).toContain("<title>Jane Austen</title>");
    expect(xml).toContain("<title>Book 1</title>");
    expect(xml).toContain("<title>Book 2</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createAuthorBooksHandler(deps);
    await handler(makeEvent("a1"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createAuthorBooksHandler(deps);
    await handler(makeEvent("a1"));

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("returns 404 for unknown contributor", async () => {
    const deps = makeDeps({
      getAuthorName: vi.fn().mockResolvedValue(null),
    });
    const handler = createAuthorBooksHandler(deps);

    await expect(handler(makeEvent("unknown-id"))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Author not found",
    });
  });

  it("throws 400 for invalid contributorId format", async () => {
    const deps = makeDeps();
    const handler = createAuthorBooksHandler(deps);

    await expect(handler(makeEvent("bad/id"))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Invalid contributorId",
    });
  });

  it("returns empty feed when author has no editions", async () => {
    const deps = makeDeps({
      getAuthorEditions: vi.fn().mockResolvedValue([]),
    });
    const handler = createAuthorBooksHandler(deps);
    const xml = (await handler(makeEvent("a1"))) as string;

    expect(xml).toContain("<title>Jane Austen</title>");
    expect(xml).not.toContain("<entry>");
  });
});
