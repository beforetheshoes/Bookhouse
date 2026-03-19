// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    redirect: (args: any) => {
      const e: any = new Error("redirect");
      Object.assign(e, args);
      throw e;
    },
    createFileRoute: (_path: string) => (opts: any) => ({
      ...opts,
      useLoaderData: () => ({}),
      useRouteContext: () => ({}),
    }),
  };
});

describe("settings/index route", () => {
  it("beforeLoad throws redirect to /settings/libraries", async () => {
    const { Route } = await import("./index");
    expect(() => Route.beforeLoad!({} as any)).toThrow("redirect");
    try {
      Route.beforeLoad!({} as any);
    } catch (e: any) {
      expect(e.to).toBe("/settings/libraries");
    }
  });
});
