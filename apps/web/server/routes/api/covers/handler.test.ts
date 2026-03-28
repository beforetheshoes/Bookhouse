import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCoverHandler, type CoverHandlerDeps } from "./handler";

function createMockDeps(overrides: Partial<CoverHandlerDeps> = {}): CoverHandlerDeps {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue("mock-stream"),
    coverCacheDir: "/data/covers",
    setResponseHeader: vi.fn(),
    sendStream: vi.fn(),
    ...overrides,
  };
}

function createMockEvent(workId: string, size: string) {
  return {
    context: {
      params: { workId, size },
    },
  };
}

describe("cover handler", () => {
  let deps: CoverHandlerDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("sends stream via sendStream for valid thumb request", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    await handler(event as never);

    expect(deps.existsSync).toHaveBeenCalledWith("/data/covers/work-1/thumb.webp");
    expect(deps.createReadStream).toHaveBeenCalledWith("/data/covers/work-1/thumb.webp");
    expect(deps.sendStream).toHaveBeenCalledWith(event, "mock-stream");
  });

  it("sends stream via sendStream for valid medium request", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "medium");

    await handler(event as never);

    expect(deps.existsSync).toHaveBeenCalledWith("/data/covers/work-1/medium.webp");
    expect(deps.sendStream).toHaveBeenCalledWith(event, "mock-stream");
  });

  it("sets Content-Type image/webp via setResponseHeader when cover exists", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    await handler(event as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Type", "image/webp");
  });

  it("sets Cache-Control header via setResponseHeader when cover exists", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    await handler(event as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  });

  it("throws 400 for invalid size", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "large");

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("returns an SVG placeholder when cover file does not exist", async () => {
    deps = createMockDeps({ existsSync: vi.fn().mockReturnValue(false) });
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    const result = await handler(event as never);

    expect(typeof result).toBe("string");
    expect(result as string).toContain("<svg");
    expect(result as string).toContain("</svg>");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Type", "image/svg+xml");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Cache-Control", "no-cache");
    expect(deps.createReadStream).not.toHaveBeenCalled();
    expect(deps.sendStream).not.toHaveBeenCalled();
  });

  it("sanitizes workId to prevent path traversal", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("../../../etc/passwd", "thumb");

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects workId with slashes", async () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("foo/bar", "thumb");

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
