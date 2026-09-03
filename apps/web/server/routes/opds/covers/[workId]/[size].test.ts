import { describe, expect, it, vi } from "vitest";
import type { OpdsCoverHandlerDeps } from "./[size]";
import type { H3Event } from "h3";
import type * as H3 from "h3";

vi.mock("h3", async (importOriginal) => ({
  ...(await importOriginal<typeof H3>()),
  defineEventHandler: vi.fn(),
}));

const { createOpdsCoverHandler } = await import("./[size]");

const jpegBuffer = Buffer.from("jpeg-data");

const basicAuth = `Basic ${Buffer.from("reader:secret").toString("base64")}`;

function makeEvent(workId: string, size: string, authorization: string | null = basicAuth): H3Event {
  return {
    context: { params: { workId, size } },
    req: { headers: { get: (name: string) => (name.toLowerCase() === "authorization" ? authorization : null) } },
    res: { headers: { set: vi.fn() } },
  } as never;
}

function makeDeps(overrides: Partial<OpdsCoverHandlerDeps> = {}): OpdsCoverHandlerDeps {
  return {
    auth: {
      findCredentialByUsername: vi.fn().mockResolvedValue({
        id: "cred-1",
        userId: "user-1",
        username: "reader",
        passwordHash: "hash",
        isEnabled: true,
      }),
      verifyPassword: vi.fn().mockResolvedValue(true),
    },
    coverCacheDir: "/data/covers",
    existsSync: vi.fn().mockReturnValue(true),
    readFile: vi.fn().mockResolvedValue(Buffer.from("webp-data")),
    convertToJpeg: vi.fn().mockResolvedValue(jpegBuffer),
    setResponseHeader: vi.fn(),
    ...overrides,
  };
}

describe("createOpdsCoverHandler", () => {
  it("requires OPDS Basic auth like every other catalog route", async () => {
    const deps = makeDeps();
    const handler = createOpdsCoverHandler(deps);

    await expect(handler(makeEvent("work-1", "thumb", null))).rejects.toMatchObject({ status: 401 });
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("returns JPEG buffer for valid cover", async () => {
    const deps = makeDeps();
    const handler = createOpdsCoverHandler(deps);
    const result = await handler(makeEvent("work-1", "thumb"));

    expect(result).toBe(jpegBuffer);
    expect(deps.readFile).toHaveBeenCalledWith("/data/covers/work-1/thumb.webp");
    expect(deps.convertToJpeg).toHaveBeenCalledWith(Buffer.from("webp-data"));
  });

  it("sets content type and cache headers", async () => {
    const deps = makeDeps();
    const handler = createOpdsCoverHandler(deps);
    await handler(makeEvent("work-1", "medium"));

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "image/jpeg",
    );
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Cache-Control",
      "public, max-age=86400",
    );
  });

  it("throws 404 when cover file does not exist", async () => {
    const deps = makeDeps({ existsSync: vi.fn().mockReturnValue(false) });
    const handler = createOpdsCoverHandler(deps);

    try {
      await handler(makeEvent("work-1", "thumb"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(404);
    }
  });

  it("throws 400 for invalid workId", async () => {
    const deps = makeDeps();
    const handler = createOpdsCoverHandler(deps);

    try {
      await handler(makeEvent("../etc/passwd", "thumb"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(400);
    }
  });

  it("throws 400 for invalid size", async () => {
    const deps = makeDeps();
    const handler = createOpdsCoverHandler(deps);

    try {
      await handler(makeEvent("work-1", "large"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(400);
    }
  });
});
