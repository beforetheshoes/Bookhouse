import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";

const mockSendStream = vi.fn();

vi.mock("h3", () => ({
  defineEventHandler: (fn: (event: object) => object | Promise<object>) => fn,
  setResponseHeader: vi.fn(),
  sendStream: (...args: unknown[]) => mockSendStream(...args),
}));

vi.mock("node:fs", () => ({
  existsSync: () => true,
  createReadStream: () => Readable.from(Buffer.from("fake-image")),
}));

describe("author photo route", () => {
  it("exports a handler function", async () => {
    const mod = await import("./[size]");
    expect(typeof mod.default).toBe("function");
  });

  it("converts Node stream to Web ReadableStream for h3 sendStream", async () => {
    const mod = await import("./[size]");
    const handler = mod.default as (event: object) => Promise<unknown>;

    const event = {
      context: { params: { contributorId: "c1", size: "thumb" } },
    };

    await handler(event);

    expect(mockSendStream).toHaveBeenCalledTimes(1);
    const [, webStream] = mockSendStream.mock.calls[0] as [unknown, unknown];
    expect(webStream).toBeInstanceOf(ReadableStream);
  });
});
