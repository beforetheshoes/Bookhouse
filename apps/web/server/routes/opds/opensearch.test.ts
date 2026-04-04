import { describe, expect, it, vi } from "vitest";
import { createOpenSearchHandler } from "./opensearch";
import type { OpenSearchHandlerDeps } from "./opensearch";
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

function makeDeps(overrides: Partial<OpenSearchHandlerDeps> = {}): OpenSearchHandlerDeps {
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

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createOpenSearchHandler(deps);
    await handler(makeEvent());

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });
});
