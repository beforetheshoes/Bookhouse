// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    redirect: (args: Record<string, unknown>) => {
      const e = Object.assign(new Error("redirect"), args);
      throw e;
    },
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      useLoaderData: () => ({}),
      useRouteContext: () => ({}),
    }),
  };
});

describe("settings/index route", () => {
  it("beforeLoad throws redirect to /settings/libraries", async () => {
    const { Route } = await import("./index");
    expect(() => Route.beforeLoad!({} as Parameters<NonNullable<typeof Route.beforeLoad>>[0])).toThrow("redirect");
    try {
      Route.beforeLoad!({} as Parameters<NonNullable<typeof Route.beforeLoad>>[0]);
    } catch (e) {
      expect((e as Record<string, unknown>).to).toBe("/settings/libraries");
    }
  });
});
