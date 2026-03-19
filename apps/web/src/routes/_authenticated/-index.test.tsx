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

describe("_authenticated/index route", () => {
  it("loader throws redirect to /library", async () => {
    const { Route } = await import("./index");
    expect(() => Route.loader!({} as Parameters<NonNullable<typeof Route.loader>>[0])).toThrow("redirect");
    try {
      Route.loader!({} as Parameters<NonNullable<typeof Route.loader>>[0]);
    } catch (e) {
      expect((e as Record<string, unknown>).href).toBe("/library");
    }
  });
});
