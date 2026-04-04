import { describe, expect, it, vi } from "vitest";
import { createShelfListHandler } from "./index";
import type { ShelfListHandlerDeps } from "./index";
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

function makeShelf(id: string, name: string, itemCount: number) {
  return {
    id,
    name,
    itemCount,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
  };
}

function makeDeps(overrides: Partial<ShelfListHandlerDeps> = {}): ShelfListHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getShelves: vi.fn().mockResolvedValue([
      makeShelf("s1", "Favorites", 5),
      makeShelf("s2", "To Read", 3),
    ]),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createShelfListHandler", () => {
  it("returns a navigation feed with shelf entries", async () => {
    const deps = makeDeps();
    const handler = createShelfListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>My Shelves</title>");
    expect(xml).toContain("<title>Favorites</title>");
    expect(xml).toContain("<title>To Read</title>");
    expect(xml).toContain('href="/opds/shelves/s1"');
    expect(xml).toContain('href="/opds/shelves/s2"');
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createShelfListHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=navigation",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createShelfListHandler(deps);
    await handler(makeEvent());

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("passes userId to getShelves", async () => {
    const deps = makeDeps();
    const handler = createShelfListHandler(deps);
    await handler(makeEvent());

    expect(deps.getShelves).toHaveBeenCalledWith("user-1");
  });

  it("returns empty feed for empty shelves", async () => {
    const deps = makeDeps({
      getShelves: vi.fn().mockResolvedValue([]),
    });
    const handler = createShelfListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>My Shelves</title>");
    expect(xml).not.toContain("<entry>");
  });

  it("includes thr:count for each shelf", async () => {
    const deps = makeDeps();
    const handler = createShelfListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('thr:count="5"');
    expect(xml).toContain('thr:count="3"');
  });
});
