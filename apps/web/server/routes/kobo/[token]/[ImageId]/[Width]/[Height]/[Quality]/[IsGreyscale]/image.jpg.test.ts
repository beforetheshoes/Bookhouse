import { describe, it, expect, vi } from "vitest";
import type { H3Event, HTTPResponse } from "h3";
import { createKoboImageHandler, type KoboImageHandlerDeps } from "./image.jpg";

const validToken = "a".repeat(64);
const cuid = "c" + "a".repeat(24);
const legacyUuid = "0123abcd-4567-89ab-cdef-0123456789ab";

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

function makeEvent(imageId: string, token = validToken): H3Event {
  return {
    context: { params: { token, ImageId: imageId, Width: "300", Height: "450" } },
  } as Partial<H3Event> as H3Event;
}

function makeDeps(overrides: Partial<KoboImageHandlerDeps> = {}): KoboImageHandlerDeps {
  return {
    auth: { findDeviceByToken: vi.fn().mockResolvedValue(mockDevice) },
    coverCacheDir: "/data/covers",
    findCoverRefByEditionId: vi.fn().mockResolvedValue("ref-1"),
    findAllEditionCoverRefs: vi.fn().mockResolvedValue([]),
    toKoboId: vi.fn(() => legacyUuid),
    existsSync: vi.fn().mockReturnValue(true),
    readFile: vi.fn().mockResolvedValue(Buffer.from("webp")),
    convertToJpeg: vi.fn().mockResolvedValue(Buffer.from("jpeg-bytes")),
    setResponseHeader: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

function status(result: Buffer | HTTPResponse): number | undefined {
  return "status" in result ? result.status : undefined;
}

describe("createKoboImageHandler", () => {
  it("rejects requests whose device token is unknown", async () => {
    const deps = makeDeps({ auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) } });
    await expect(createKoboImageHandler(deps)(makeEvent(cuid))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(deps.findCoverRefByEditionId).not.toHaveBeenCalled();
  });

  it("rejects requests whose token is malformed before touching the database", async () => {
    const deps = makeDeps();
    await expect(createKoboImageHandler(deps)(makeEvent(cuid, "short"))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(deps.auth.findDeviceByToken).not.toHaveBeenCalled();
  });

  it("serves the edition cover as JPEG with length and cache headers", async () => {
    const deps = makeDeps();
    const event = makeEvent(`${cuid}-v3`);
    const result = await createKoboImageHandler(deps)(event);

    expect(result).toEqual(Buffer.from("jpeg-bytes"));
    expect(deps.findCoverRefByEditionId).toHaveBeenCalledWith(cuid);
    expect(deps.readFile).toHaveBeenCalledWith("/data/covers/ref-1/medium.webp");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Type", "image/jpeg");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Length", "10");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Cache-Control", "public, max-age=86400");
    expect(deps.log).toHaveBeenCalledWith(
      "[kobo] IMAGE serving cover /data/covers/ref-1/medium.webp (10 bytes jpeg)",
    );
  });

  it("logs the requested id and dimensions", async () => {
    const deps = makeDeps();
    await createKoboImageHandler(deps)(makeEvent(cuid));
    expect(deps.log).toHaveBeenCalledWith(`[kobo] IMAGE ${cuid} (300x450)`);
  });

  it("tolerates a request with no image or size params", async () => {
    const deps = makeDeps();
    const event = { context: { params: { token: validToken } } } as Partial<H3Event> as H3Event;
    const result = await createKoboImageHandler(deps)(event);
    expect(status(result)).toBe(204);
    expect(deps.log).toHaveBeenCalledWith("[kobo] IMAGE  (x)");
  });

  it("resolves a legacy UUID image id through the derived Kobo id", async () => {
    const deps = makeDeps({
      findAllEditionCoverRefs: vi.fn().mockResolvedValue([{ id: cuid, coverRef: "ref-legacy" }]),
    });
    const result = await createKoboImageHandler(deps)(makeEvent(legacyUuid));
    expect(result).toEqual(Buffer.from("jpeg-bytes"));
    expect(deps.readFile).toHaveBeenCalledWith("/data/covers/ref-legacy/medium.webp");
  });

  it("answers 204 for an unknown edition", async () => {
    const deps = makeDeps({ findCoverRefByEditionId: vi.fn().mockResolvedValue(null) });
    const result = await createKoboImageHandler(deps)(makeEvent(cuid));
    expect(status(result)).toBe(204);
    expect(deps.readFile).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(`[kobo] IMAGE no cover found for ${cuid}`);
  });

  it("answers 204 for a Kobo store image id", async () => {
    const deps = makeDeps();
    const result = await createKoboImageHandler(deps)(makeEvent("store-image-123"));
    expect(status(result)).toBe(204);
    expect(deps.findCoverRefByEditionId).not.toHaveBeenCalled();
  });

  it("answers 204 when the cover file is missing from the cache", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(false) });
    const result = await createKoboImageHandler(deps)(makeEvent(cuid));
    expect(status(result)).toBe(204);
    expect(deps.setResponseHeader).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(`[kobo] IMAGE cover file not found for edition ${cuid}`);
  });
});
