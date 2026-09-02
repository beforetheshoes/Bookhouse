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
  } as Partial<H3Event> as H3Event;
}

function makeDeps(overrides: Partial<CoverHandlerDeps> = {}): CoverHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    coverCacheDir: "/data/covers",
    findCoverRef: vi.fn().mockResolvedValue("ref-1"),
    existsSync: vi.fn().mockReturnValue(true),
    readFile: vi.fn().mockResolvedValue(Buffer.from("webp")),
    convertToJpeg: vi.fn().mockResolvedValue(Buffer.from("jpeg-bytes")),
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

async function expectStatus(promise: Promise<Buffer>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toMatchObject({ statusCode });
}

describe("createCoverHandler", () => {
  it("transcodes the cached WebP to JPEG and sets the response headers", async () => {
    const deps = makeDeps();
    const handler = createCoverHandler(deps);
    const event = makeEvent();
    const result = await handler(event);

    expect(result).toEqual(Buffer.from("jpeg-bytes"));
    expect(deps.findCoverRef).toHaveBeenCalledWith("ed-1");
    expect(deps.readFile).toHaveBeenCalledWith("/data/covers/ref-1/medium.webp");
    expect(deps.convertToJpeg).toHaveBeenCalledWith(Buffer.from("webp"));
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Type", "image/jpeg");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Length", "10");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Cache-Control", "public, max-age=86400");
  });

  it("throws 400 for invalid bookId", async () => {
    const deps = makeDeps();
    await expectStatus(createCoverHandler(deps)(makeEvent("../bad")), 400);
    expect(deps.findCoverRef).not.toHaveBeenCalled();
  });

  it("throws 404 when the edition has no cover", async () => {
    const deps = makeDeps({ findCoverRef: vi.fn().mockResolvedValue(null) });
    await expectStatus(createCoverHandler(deps)(makeEvent()), 404);
    expect(deps.existsSync).not.toHaveBeenCalled();
  });

  it("throws 404 when cover file does not exist on disk", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(false) });
    await expectStatus(createCoverHandler(deps)(makeEvent()), 404);
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("throws when auth fails", async () => {
    const deps = makeDeps({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
    });
    await expectStatus(createCoverHandler(deps)(makeEvent()), 401);
  });
});
