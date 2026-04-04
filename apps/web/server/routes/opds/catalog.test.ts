import { describe, expect, it, vi } from "vitest";
import { createCatalogHandler } from "./catalog";
import type { CatalogHandlerDeps } from "./catalog";
import type { H3Event } from "h3";

const mockCredential = {
  id: "cred-1",
  userId: "user-1",
  username: "reader",
  passwordHash: "salt:hash",
  isEnabled: true,
};

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

function makeDeps(overrides: Partial<CatalogHandlerDeps> = {}): CatalogHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createCatalogHandler", () => {
  it("returns a navigation feed with all sub-feeds", async () => {
    const deps = makeDeps();
    const handler = createCatalogHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Bookhouse</title>");
    expect(xml).toContain("<title>All Books</title>");
    expect(xml).toContain("<title>Recently Added</title>");
    expect(xml).toContain("<title>Authors</title>");
    expect(xml).toContain("<title>Series</title>");
    expect(xml).toContain("<title>My Shelves</title>");
    expect(xml).toContain("<title>Publishers</title>");
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createCatalogHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=navigation",
    );
  });

  it("includes search link", async () => {
    const deps = makeDeps();
    const handler = createCatalogHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('rel="search"');
    expect(xml).toContain('href="/opds/opensearch.xml"');
  });

  it("includes start link", async () => {
    const deps = makeDeps();
    const handler = createCatalogHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('rel="start"');
    expect(xml).toContain('href="/opds/catalog"');
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createCatalogHandler(deps);
    await handler(makeEvent());

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });
});
