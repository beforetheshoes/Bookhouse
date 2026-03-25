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

describe("settings/jobs index route", () => {
  it("beforeLoad throws redirect to /settings", async () => {
    const { Route } = await import("./jobs.index");
    const beforeLoad = Route.options.beforeLoad as (args: Record<string, unknown>) => unknown;
    expect(() => beforeLoad({})).toThrow("redirect");
    try {
      beforeLoad({});
    } catch (e) {
      expect((e as Record<string, unknown>).to).toBe("/settings");
    }
  });
});
