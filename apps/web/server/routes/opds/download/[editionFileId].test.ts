import { describe, expect, it, vi } from "vitest";
import { createOpdsDownloadHandler } from "./[editionFileId]";
import type { OpdsDownloadHandlerDeps } from "./[editionFileId]";
import type { H3Event } from "h3";

const mockCredential = {
  id: "cred-1",
  userId: "user-1",
  username: "reader",
  passwordHash: "salt:hash",
  isEnabled: true,
};

const mockFile = {
  absolutePath: "/library/book.epub",
  basename: "book.epub",
  mimeType: "application/epub+zip",
  availabilityStatus: "PRESENT",
};

const mockStream = { pipe: vi.fn() } as unknown as NodeJS.ReadableStream;

function makeEvent(editionFileId: string): H3Event {
  return {
    node: {
      req: {
        headers: {
          authorization: `Basic ${Buffer.from("reader:password").toString("base64")}`,
        },
      },
    },
    context: { params: { editionFileId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<OpdsDownloadHandlerDeps> = {}): OpdsDownloadHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    findEditionFile: vi.fn().mockResolvedValue(mockFile),
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue(mockStream),
    setResponseHeader: vi.fn(),
    sendStream: vi.fn().mockReturnValue("stream-sent"),
    ...overrides,
  };
}

describe("createOpdsDownloadHandler", () => {
  it("streams the file with correct headers", async () => {
    const deps = makeDeps();
    const handler = createOpdsDownloadHandler(deps);
    const result = await handler(makeEvent("ef-1"));

    expect(result).toBe("stream-sent");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/epub+zip",
    );
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Disposition",
      'attachment; filename="book.epub"',
    );
    expect(deps.createReadStream).toHaveBeenCalledWith("/library/book.epub");
  });

  it("throws 400 for invalid editionFileId", async () => {
    const deps = makeDeps();
    const handler = createOpdsDownloadHandler(deps);

    try {
      await handler(makeEvent("../bad-id"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(400);
    }
  });

  it("throws 404 when edition file not found", async () => {
    const deps = makeDeps({ findEditionFile: vi.fn().mockResolvedValue(null) });
    const handler = createOpdsDownloadHandler(deps);

    try {
      await handler(makeEvent("ef-missing"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("throws 404 when file is not PRESENT", async () => {
    const deps = makeDeps({
      findEditionFile: vi.fn().mockResolvedValue({
        ...mockFile,
        availabilityStatus: "MISSING",
      }),
    });
    const handler = createOpdsDownloadHandler(deps);

    try {
      await handler(makeEvent("ef-1"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("throws 404 when file missing from disk", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(false) });
    const handler = createOpdsDownloadHandler(deps);

    try {
      await handler(makeEvent("ef-1"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("uses application/octet-stream for null mimeType", async () => {
    const deps = makeDeps({
      findEditionFile: vi.fn().mockResolvedValue({ ...mockFile, mimeType: null }),
    });
    const handler = createOpdsDownloadHandler(deps);
    await handler(makeEvent("ef-1"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/octet-stream",
    );
  });

  it("authenticates the request", async () => {
    const deps = makeDeps();
    const handler = createOpdsDownloadHandler(deps);
    await handler(makeEvent("ef-1"));

    expect(deps.auth.findCredentialByUsername).toHaveBeenCalledWith("reader");
  });
});
