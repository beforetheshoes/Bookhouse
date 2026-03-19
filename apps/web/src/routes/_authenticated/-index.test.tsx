// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    redirect: (args: Record<string, unknown>) => {
      const e = Object.assign(new Error("redirect"), args);
      throw e;
    },
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => ({}),
      useRouteContext: () => ({}),
    }),
  };
});

describe("_authenticated/index route", () => {
  it("loader throws redirect to /library", async () => {
    const { Route } = await import("./index");
    expect(() => (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({})).toThrow("redirect");
    try {
      await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    } catch (e) {
      expect((e as Record<string, unknown>).href).toBe("/library");
    }
  });
});
