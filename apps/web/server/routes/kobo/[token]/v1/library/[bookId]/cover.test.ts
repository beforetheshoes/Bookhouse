import { describe, it, expect, vi } from "vitest";
import { createCoverHandler } from "./cover";
import type { CoverHandlerDeps } from "./cover";
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

function makeEvent(bookId = "ed-1"): H3Event {
  return {
    context: { params: { token: validToken, bookId } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<CoverHandlerDeps> = {}): CoverHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    findCoverPath: vi.fn().mockResolvedValue("/covers/test.jpg"),
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue("stream"),
    setResponseHeader: vi.fn(),
    sendStream: vi.fn().mockReturnValue("streamed"),
    ...overrides,
  };
}

describe("createCoverHandler", () => {
  it("streams cover image with correct headers", async () => {
    const deps = makeDeps();
    const handler = createCoverHandler(deps);
    const event = makeEvent();
    const result = await handler(event);

    expect(result).toBe("streamed");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Content-Type",
      "image/jpeg",
    );
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      event,
      "Cache-Control",
      "public, max-age=86400",
    );
  });

  it("throws 400 for invalid bookId", async () => {
    const deps = makeDeps();
    const handler = createCoverHandler(deps);

    try {
      await handler(makeEvent("../bad"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(400);
    }
  });

  it("throws 404 when cover path is null", async () => {
    const deps = makeDeps({
      findCoverPath: vi.fn().mockResolvedValue(null),
    });
    const handler = createCoverHandler(deps);

    try {
      await handler(makeEvent());
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("throws 404 when cover file does not exist on disk", async () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(false),
    });
    const handler = createCoverHandler(deps);

    try {
      await handler(makeEvent());
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("throws when auth fails", async () => {
    const deps = makeDeps({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
    });
    const handler = createCoverHandler(deps);

    await expect(handler(makeEvent())).rejects.toThrow();
  });
});
