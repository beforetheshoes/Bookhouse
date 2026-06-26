import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { z } from "zod";

const getQueryMock = vi.fn<(event: H3Event) => Record<string, string>>();
vi.mock("h3", () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  getQuery: (event: H3Event) => getQueryMock(event),
}));

const { parseParams, parseQuery } = await import("./validate");

const eventWith = (params: Record<string, string>) =>
  ({ context: { params } }) as object as H3Event;

describe("parseParams", () => {
  it("returns the typed params on a valid request", () => {
    const result = parseParams(eventWith({ workId: "w1" }), z.object({ workId: z.string().min(1) }));
    expect(result).toEqual({ workId: "w1" });
  });

  it("throws a 400 when a param is missing or empty", () => {
    expect(() =>
      parseParams(eventWith({ workId: "" }), z.object({ workId: z.string().min(1) })),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe("parseQuery", () => {
  beforeEach(() => {
    getQueryMock.mockReset();
  });

  it("returns the typed, coerced query on a valid request", () => {
    getQueryMock.mockReturnValue({ page: "2" });
    const result = parseQuery(
      {} as object as H3Event,
      z.object({ page: z.coerce.number().int().min(1).default(1) }),
    );
    expect(result).toEqual({ page: 2 });
  });

  it("throws a 400 when the query is invalid", () => {
    getQueryMock.mockReturnValue({ page: "-5" });
    expect(() =>
      parseQuery({} as object as H3Event, z.object({ page: z.coerce.number().int().min(1) })),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
