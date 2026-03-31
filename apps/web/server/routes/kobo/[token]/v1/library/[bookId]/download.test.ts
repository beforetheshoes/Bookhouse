import { describe, it, expect, vi } from "vitest";
import { createDownloadHandler } from "./download";
import type { DownloadHandlerDeps } from "./download";
import type { H3Event } from "h3";

const validToken = "a".repeat(64);

const mockDevice = {
  id: "d1",
  userId: "u1",
  deviceId: "My Kobo",
  userKey: "key",
  authToken: validToken,
  status: "ACTIVE",
  lastSyncAt: null,
  createdAt: new Date("2024-01-01"),
};

const mockFile = {
  absolutePath: "/books/test.epub",
  basename: "test.epub",
  mimeType: "application/epub+zip",
  availabilityStatus: "PRESENT",
};

function makeEvent(bookId = "ed-1"): H3Event {
  return {
    context: { params: { token: validToken, bookId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<DownloadHandlerDeps> = {}): DownloadHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    findEditionFile: vi.fn().mockResolvedValue(mockFile),
    convertToKepub: vi.fn().mockResolvedValue("/cache/test.kepub.epub"),
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ size: 1024000 }),
    createReadStream: vi.fn().mockReturnValue("stream"),
    setResponseHeader: vi.fn(),
    sendStream: vi.fn().mockReturnValue("streamed"),
    ...overrides,
  };
}

describe("createDownloadHandler", () => {
  it("converts epub to kepub and streams", async () => {
    const deps = makeDeps();
    const handler = createDownloadHandler(deps);
    const event = makeEvent();
    const result = await handler(event);

    expect(result).toBe("streamed");
    expect(deps.convertToKepub).toHaveBeenCalledWith("/books/test.epub");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Disposition",
      'attachment; filename="test.kepub.epub"',
    );
  });

  it("falls back to original epub when conversion fails", async () => {
    const deps = makeDeps({
      convertToKepub: vi.fn().mockRejectedValue(new Error("kepubify failed")),
    });
    const handler = createDownloadHandler(deps);
    const event = makeEvent();
    const result = await handler(event);

    expect(result).toBe("streamed");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Disposition",
      'attachment; filename="test.epub"',
    );
  });

  it("skips conversion for non-epub files", async () => {
    const deps = makeDeps({
      findEditionFile: vi.fn().mockResolvedValue({
        ...mockFile,
        basename: "test.pdf",
        mimeType: "application/pdf",
      }),
    });
    const handler = createDownloadHandler(deps);
    await handler(makeEvent());

    expect(deps.convertToKepub).not.toHaveBeenCalled();
  });

  it("converts files with epub extension regardless of mimeType", async () => {
    const deps = makeDeps({
      findEditionFile: vi.fn().mockResolvedValue({
        ...mockFile,
        mimeType: "application/octet-stream",
        basename: "book.epub",
      }),
    });
    const handler = createDownloadHandler(deps);
    await handler(makeEvent());

    expect(deps.convertToKepub).toHaveBeenCalled();
  });

  it("throws 400 for invalid bookId", async () => {
    const deps = makeDeps();
    const handler = createDownloadHandler(deps);

    try {
      await handler(makeEvent("../bad"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(400);
    }
  });

  it("throws 404 when file not found", async () => {
    const deps = makeDeps({
      findEditionFile: vi.fn().mockResolvedValue(null),
    });
    const handler = createDownloadHandler(deps);

    try {
      await handler(makeEvent());
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
    const handler = createDownloadHandler(deps);

    try {
      await handler(makeEvent());
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("throws 404 when file missing from disk", async () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(false),
    });
    const handler = createDownloadHandler(deps);

    try {
      await handler(makeEvent());
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("sets KEPUB content-type after successful conversion", async () => {
    const deps = makeDeps();
    const handler = createDownloadHandler(deps);
    const event = makeEvent();
    await handler(event);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Type",
      "application/x-kobo-epub+zip",
    );
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Length",
      "1024000",
    );
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Cache-Control",
      "private, no-cache",
    );
  });

  it("sets epub content-type when conversion fails", async () => {
    const deps = makeDeps({
      convertToKepub: vi.fn().mockRejectedValue(new Error("kepubify failed")),
    });
    const handler = createDownloadHandler(deps);
    const event = makeEvent();
    await handler(event);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Type",
      "application/epub+zip",
    );
  });

  it("falls back to epub content-type when mimeType is null and no epub extension", async () => {
    const deps = makeDeps({
      findEditionFile: vi.fn().mockResolvedValue({
        ...mockFile,
        mimeType: null,
        basename: "test.pdf",
      }),
    });
    const handler = createDownloadHandler(deps);
    const event = makeEvent();
    await handler(event);

    expect(deps.convertToKepub).not.toHaveBeenCalled();
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Type",
      "application/epub+zip",
    );
  });

  it("throws when auth fails", async () => {
    const deps = makeDeps({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
    });
    const handler = createDownloadHandler(deps);

    await expect(handler(makeEvent())).rejects.toThrow();
  });
});
