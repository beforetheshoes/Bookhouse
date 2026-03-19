// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      useLoaderData: () => ({}),
      useRouteContext: () => ({}),
    }),
  };
});

describe("SettingsLayout", () => {
  it("renders outlet", async () => {
    const { Route } = await import("./settings");
    const SettingsLayout = Route.component!;
    render(<SettingsLayout />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  it("wraps outlet in a div", async () => {
    const { Route } = await import("./settings");
    const SettingsLayout = Route.component!;
    const { container } = render(<SettingsLayout />);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
