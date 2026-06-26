import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import type { H3Event } from "h3";

vi.mock("h3", () => ({
  defineEventHandler: (fn: (event: object) => object | Promise<object>) => fn,
  setResponseHeader: vi.fn(),
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

  it("returns the author photo as a Web ReadableStream", async () => {
    const mod = await import("./[size]");
    const event = {
      context: { params: { contributorId: "c1", size: "thumb" } },
    } as Partial<H3Event> as H3Event;

    const result = mod.default(event);

    expect(result).toBeInstanceOf(ReadableStream);
  });
});
