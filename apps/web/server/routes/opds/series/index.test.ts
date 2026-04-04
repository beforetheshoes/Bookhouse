import { describe, expect, it, vi } from "vitest";
import { createSeriesListHandler } from "./index";
import type { SeriesListHandlerDeps } from "./index";
import type { H3Event } from "h3";

const mockCredential = {
  id: "cred-1",
  userId: "user-1",
  username: "reader",
  passwordHash: "salt:hash",
  isEnabled: true,
};

function makeSeries(id: string, name: string, workCount: number) {
  return {
    id,
    name,
    workCount,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
  };
}

function makeEvent(): H3Event {
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<SeriesListHandlerDeps> = {}): SeriesListHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getSeries: vi.fn().mockResolvedValue([
      makeSeries("series-1", "Discworld", 41),
      makeSeries("series-2", "Foundation", 7),
    ]),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createSeriesListHandler", () => {
  it("returns a navigation feed with series entries", async () => {
    const deps = makeDeps();
    const handler = createSeriesListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Series</title>");
    expect(xml).toContain("<title>Discworld</title>");
    expect(xml).toContain("<title>Foundation</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createSeriesListHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=navigation",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createSeriesListHandler(deps);
    await handler(makeEvent());

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("includes thr:count for work counts", async () => {
    const deps = makeDeps();
    const handler = createSeriesListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('thr:count="41"');
    expect(xml).toContain('thr:count="7"');
  });

  it("includes correct hrefs for each series", async () => {
    const deps = makeDeps();
    const handler = createSeriesListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('href="/opds/series/series-1"');
    expect(xml).toContain('href="/opds/series/series-2"');
  });

  it("returns empty feed when no series exist", async () => {
    const deps = makeDeps({
      getSeries: vi.fn().mockResolvedValue([]),
    });
    const handler = createSeriesListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Series</title>");
    expect(xml).not.toContain("<entry>");
  });
});
