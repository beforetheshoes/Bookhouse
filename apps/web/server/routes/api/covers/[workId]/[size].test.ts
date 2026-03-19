import { describe, it, expect, vi } from "vitest";

vi.mock("h3", () => ({
  defineEventHandler: (fn: unknown) => fn,
}));

describe("cover route", () => {
  it("exports a handler function", async () => {
    const mod = await import("./[size]");
    expect(typeof mod.default).toBe("function");
  });
});
