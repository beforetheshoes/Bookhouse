import { describe, expect, it, vi } from "vitest";
import type { SeriesBooksHandlerDeps } from "./[seriesId]";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";

vi.mock("h3", () => ({
  getRouterParam: (_event: unknown, name: string) => {
    const e = _event as { _params?: Record<string, string> };
    return e._params?.[name];
  },
  defineEventHandler: vi.fn(),
}));

// Must import after mock
const { createSeriesBooksHandler } = await import("./[seriesId]");

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
    seriesName: "Discworld",
    seriesPosition: Number(id),
    updatedAt: new Date("2024-06-01T12:00:00Z"),
    contributors: [],
    files: [
      { editionFileId: `ef-${id}`, mimeType: "application/epub+zip", sizeBytes: 1000n, basename: "book.epub" },
    ],
  };
}

function makeEvent(seriesId: string): H3Event {
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
    _params: { seriesId },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<SeriesBooksHandlerDeps> = {}): SeriesBooksHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getSeriesEditions: vi.fn().mockResolvedValue([makeEdition("1"), makeEdition("2")]),
    getSeriesName: vi.fn().mockResolvedValue("Discworld"),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createSeriesBooksHandler", () => {
  it("returns an acquisition feed with series editions", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);
    const xml = (await handler(makeEvent("series-1"))) as string;

    expect(xml).toContain("<title>Discworld</title>");
    expect(xml).toContain("<title>Book 1</title>");
    expect(xml).toContain("<title>Book 2</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);
    await handler(makeEvent("series-1"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=acquisition",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);
    await handler(makeEvent("series-1"));

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("returns 404 for unknown series", async () => {
    const deps = makeDeps({
      getSeriesName: vi.fn().mockResolvedValue(null),
    });
    const handler = createSeriesBooksHandler(deps);

    await expect(handler(makeEvent("unknown-id"))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Not Found",
    });
  });

  it("returns 400 for invalid series ID", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);

    await expect(handler(makeEvent("../etc/passwd"))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Bad Request",
    });
  });

  it("passes series ID to deps", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);
    await handler(makeEvent("series-1"));

    expect(deps.getSeriesName).toHaveBeenCalledWith("series-1");
    expect(deps.getSeriesEditions).toHaveBeenCalledWith("series-1");
  });

  it("includes correct feed id and self href", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);
    const xml = (await handler(makeEvent("series-1"))) as string;

    expect(xml).toContain("<id>urn:bookhouse:series:series-1</id>");
    expect(xml).toContain('href="/opds/series/series-1"');
  });

  it("returns empty feed when series has no editions", async () => {
    const deps = makeDeps({
      getSeriesEditions: vi.fn().mockResolvedValue([]),
    });
    const handler = createSeriesBooksHandler(deps);
    const xml = (await handler(makeEvent("series-1"))) as string;

    expect(xml).toContain("<title>Discworld</title>");
    expect(xml).not.toContain("<entry>");
  });

  it("falls back to empty seriesId when getRouterParam returns undefined", async () => {
    const deps = makeDeps();
    const handler = createSeriesBooksHandler(deps);
    const event = {
      node: {
        req: {
          headers: {
            authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
          },
        },
      },
      _params: {},
    } as unknown as H3Event;

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Bad Request",
    });
  });
});
