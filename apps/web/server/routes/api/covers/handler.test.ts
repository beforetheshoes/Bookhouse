import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { createCoverHandler, type CoverHandlerDeps } from "./handler";

function createMockDeps(overrides: Partial<CoverHandlerDeps> = {}): CoverHandlerDeps {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue("mock-stream" as unknown as NodeJS.ReadableStream),
    coverCacheDir: "/data/covers",
    setResponseHeader: vi.fn(),
    sendStream: vi.fn(),
    ...overrides,
  };
}

function createMockEvent(workId: string, size: string): H3Event {
  return {
    context: {
      params: { workId, size },
    },
  } as Partial<H3Event> as H3Event;
}

function captureThrow(fn: () => unknown): { statusCode?: number; statusMessage?: string } {
  try {
    fn();
  } catch (error) {
    return error as { statusCode?: number; statusMessage?: string };
  }
  throw new Error("expected handler to throw");
}

describe("cover handler", () => {
  let deps: CoverHandlerDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("sends stream via sendStream for valid thumb request", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    handler(event);

    expect(deps.existsSync).toHaveBeenCalledWith("/data/covers/work-1/thumb.webp");
    expect(deps.createReadStream).toHaveBeenCalledWith("/data/covers/work-1/thumb.webp");
    expect(deps.sendStream).toHaveBeenCalledWith(event, "mock-stream");
  });

  it("sends stream via sendStream for valid medium request", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "medium");

    handler(event);

    expect(deps.existsSync).toHaveBeenCalledWith("/data/covers/work-1/medium.webp");
    expect(deps.sendStream).toHaveBeenCalledWith(event, "mock-stream");
  });

  it("sets Content-Type image/webp via setResponseHeader when cover exists", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    handler(event);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Type", "image/webp");
  });

  it("sets Cache-Control header via setResponseHeader when cover exists", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    handler(event);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  });

  it("throws 400 for invalid size", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "large");

    expect(captureThrow(() => handler(event)).statusCode).toBe(400);
  });

  it("returns an SVG placeholder when cover file does not exist", () => {
    deps = createMockDeps({ existsSync: vi.fn().mockReturnValue(false) });
    const handler = createCoverHandler(deps);
    const event = createMockEvent("work-1", "thumb");

    const result = handler(event);

    expect(typeof result).toBe("string");
    expect(result as string).toContain("<svg");
    expect(result as string).toContain("</svg>");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Content-Type", "image/svg+xml");
    expect(deps.setResponseHeader).toHaveBeenCalledWith(event, "Cache-Control", "no-cache");
    expect(deps.createReadStream).not.toHaveBeenCalled();
    expect(deps.sendStream).not.toHaveBeenCalled();
  });

  it("sanitizes workId to prevent path traversal", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("../../../etc/passwd", "thumb");

    expect(captureThrow(() => handler(event)).statusCode).toBe(400);
  });

  it("rejects workId with slashes", () => {
    const handler = createCoverHandler(deps);
    const event = createMockEvent("foo/bar", "thumb");

    expect(captureThrow(() => handler(event)).statusCode).toBe(400);
  });

  it("uses custom idParamName when provided", () => {
    deps = createMockDeps({ idParamName: "contributorId" });
    const handler = createCoverHandler(deps);
    const event = {
      context: {
        params: { contributorId: "c1", size: "thumb" },
      },
    } as Partial<H3Event> as H3Event;

    handler(event);

    expect(deps.existsSync).toHaveBeenCalledWith("/data/covers/c1/thumb.webp");
    expect(deps.sendStream).toHaveBeenCalled();
  });

  it("throws 400 with custom idParamName for invalid id", () => {
    deps = createMockDeps({ idParamName: "contributorId" });
    const handler = createCoverHandler(deps);
    const event = {
      context: {
        params: { contributorId: "../etc/passwd", size: "thumb" },
      },
    } as Partial<H3Event> as H3Event;

    const error = captureThrow(() => handler(event));
    expect(error.statusCode).toBe(400);
    expect(error.statusMessage).toBe("Invalid contributorId");
  });
});
