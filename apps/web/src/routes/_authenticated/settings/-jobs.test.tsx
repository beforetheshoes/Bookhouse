// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => ({}),
      useRouteContext: () => ({}),
    }),
  };
});

describe("JobsLayout", () => {
  it("renders outlet", async () => {
    const { Route } = await import("./jobs");
    const JobsLayout = (Route.options.component as React.ComponentType);
    render(<JobsLayout />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });
});
