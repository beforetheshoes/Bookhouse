import { describe, expect, it, vi } from "vitest";
import { createPublisherListHandler } from "./index";
import type { PublisherListHandlerDeps } from "./index";
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

function makePublisher(name: string, editionCount: number) {
  return {
    name,
    editionCount,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
  };
}

function makeDeps(overrides: Partial<PublisherListHandlerDeps> = {}): PublisherListHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    getPublishers: vi.fn().mockResolvedValue([
      makePublisher("Penguin Books", 10),
      makePublisher("HarperCollins", 7),
    ]),
    getBaseUrl: () => "https://books.example.com",
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createPublisherListHandler", () => {
  it("returns a navigation feed with publisher entries", async () => {
    const deps = makeDeps();
    const handler = createPublisherListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Publishers</title>");
    expect(xml).toContain("<title>Penguin Books</title>");
    expect(xml).toContain("<title>HarperCollins</title>");
    expect(xml).toContain('href="/opds/publishers/Penguin%20Books"');
    expect(xml).toContain('href="/opds/publishers/HarperCollins"');
  });

  it("sets correct content type header", async () => {
    const deps = makeDeps();
    const handler = createPublisherListHandler(deps);
    await handler(makeEvent());

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/atom+xml;profile=opds-catalog;kind=navigation",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createPublisherListHandler(deps);
    await handler(makeEvent());

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });

  it("returns empty feed for no publishers", async () => {
    const deps = makeDeps({
      getPublishers: vi.fn().mockResolvedValue([]),
    });
    const handler = createPublisherListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain("<title>Publishers</title>");
    expect(xml).not.toContain("<entry>");
  });

  it("includes thr:count for each publisher", async () => {
    const deps = makeDeps();
    const handler = createPublisherListHandler(deps);
    const xml = (await handler(makeEvent())) as string;

    expect(xml).toContain('thr:count="10"');
    expect(xml).toContain('thr:count="7"');
  });
});
