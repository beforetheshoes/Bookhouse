import { describe, expect, it, vi } from "vitest";
import type { OpenSearchHandlerDeps } from "./opensearch";
import type { H3Event } from "h3";

vi.mock("h3", () => ({
  defineEventHandler: vi.fn(),
}));

const { createOpenSearchHandler } = await import("./opensearch");

function makeEvent(): H3Event {
  return {} as unknown as H3Event;
}

function makeDeps(overrides: Partial<OpenSearchHandlerDeps> = {}): OpenSearchHandlerDeps {
  return {
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createOpenSearchHandler", () => {
  it("returns an OpenSearch descriptor", async () => {
    const deps = makeDeps();
    const handler = createOpenSearchHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<ShortName>Bookhouse</ShortName>");
    expect(xml).toContain("https://books.example.com/opds/search?q={searchTerms}");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createOpenSearchHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/opensearchdescription+xml",
    );
  });
});
