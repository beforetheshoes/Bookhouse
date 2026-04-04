import { describe, expect, it, vi } from "vitest";
import { createAuthorListHandler } from "./index";
import type { AuthorListHandlerDeps } from "./index";
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

function makeAuthor(id: string, name: string, editionCount: number) {
  return {
    id,
    nameDisplay: name,
    editionCount,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
  };
}

function makeDeps(overrides: Partial<AuthorListHandlerDeps> = {}): AuthorListHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getAuthors: vi.fn().mockResolvedValue([
      makeAuthor("a1", "Jane Austen", 5),
      makeAuthor("a2", "Charles Dickens", 3),
    ]),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createAuthorListHandler", () => {
  it("returns a navigation feed with author entries", async () => {
    const deps = makeDeps();
    const handler = createAuthorListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Authors</title>");
    expect(xml).toContain("<title>Jane Austen</title>");
    expect(xml).toContain("<title>Charles Dickens</title>");
    expect(xml).toContain('href="/opds/authors/a1"');
    expect(xml).toContain('href="/opds/authors/a2"');
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createAuthorListHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=navigation",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createAuthorListHandler(deps);
    await handler(makeEvent());

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("returns empty feed for empty author list", async () => {
    const deps = makeDeps({
      getAuthors: vi.fn().mockResolvedValue([]),
    });
    const handler = createAuthorListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Authors</title>");
    expect(xml).not.toContain("<entry>");
  });

  it("includes thr:count for each author", async () => {
    const deps = makeDeps();
    const handler = createAuthorListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('thr:count="5"');
    expect(xml).toContain('thr:count="3"');
  });
});
