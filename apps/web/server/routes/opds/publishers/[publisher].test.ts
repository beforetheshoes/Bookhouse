import { describe, expect, it, vi } from "vitest";
import type { PublisherBooksHandlerDeps } from "./[publisher]";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  defineEventHandler: vi.fn(),
}));

// Must import after mock
const { createPublisherBooksHandler } = await import("./[publisher]");

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
    publisher: "Penguin Books",
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

function makeEvent(publisher: string): H3Event {
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
    context: { params: { publisher } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<PublisherBooksHandlerDeps> = {}): PublisherBooksHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getPublisherEditions: vi.fn().mockResolvedValue([makeEdition("1"), makeEdition("2")]),
    publisherExists: vi.fn().mockResolvedValue(true),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createPublisherBooksHandler", () => {
  it("returns an acquisition feed with books by the publisher", async () => {
    const deps = makeDeps();
    const handler = createPublisherBooksHandler(deps);
    const xml = (await handler(makeEvent("Penguin%20Books"))) as string;

    expect(xml).toContain("<title>Penguin Books</title>");
    expect(xml).toContain("<title>Book 1</title>");
    expect(xml).toContain("<title>Book 2</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createPublisherBooksHandler(deps);
    await handler(makeEvent("Penguin%20Books"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createPublisherBooksHandler(deps);
    await handler(makeEvent("Penguin%20Books"));

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("returns 404 for unknown publisher", async () => {
    const deps = makeDeps({
      publisherExists: vi.fn().mockResolvedValue(false),
    });
    const handler = createPublisherBooksHandler(deps);

    await expect(handler(makeEvent("Unknown%20Publisher"))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Publisher not found",
    });
  });

  it("URL-decodes publisher name", async () => {
    const deps = makeDeps();
    const handler = createPublisherBooksHandler(deps);
    await handler(makeEvent("Penguin%20Books"));

    expect(deps.publisherExists).toHaveBeenCalledWith("Penguin Books");
    expect(deps.getPublisherEditions).toHaveBeenCalledWith("Penguin Books");
  });

  it("returns empty feed when publisher has no editions", async () => {
    const deps = makeDeps({
      getPublisherEditions: vi.fn().mockResolvedValue([]),
    });
    const handler = createPublisherBooksHandler(deps);
    const xml = (await handler(makeEvent("Penguin%20Books"))) as string;

    expect(xml).toContain("<title>Penguin Books</title>");
    expect(xml).not.toContain("<entry>");
  });
});
