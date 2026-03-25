// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mockRouteContext = { user: { name: "Test User", email: "test@test.com", image: null }, theme: "system" as const };

vi.mock("~/components/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar">sidebar</div>,
}));

vi.mock("~/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header">header</div>,
}));

vi.mock("~/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: React.ReactNode }) => <div data-testid="sidebar-provider">{children}</div>,
  SidebarInset: ({ children }: { children?: React.ReactNode }) => <div data-testid="sidebar-inset">{children}</div>,
}));

vi.mock("~/lib/auth-client", () => ({
  getCurrentUserServerFn: vi.fn(),
}));

vi.mock("~/hooks/use-theme", () => ({
  ThemeProvider: ({ children }: { children?: React.ReactNode }) => <div data-testid="theme-provider">{children}</div>,
}));

vi.mock("~/lib/server-fns/app-settings", () => ({
  getThemeServerFn: vi.fn().mockResolvedValue("system"),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    redirect: (args: Record<string, unknown>) => {
      const e = Object.assign(new Error("redirect"), args);
      throw e;
    },
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => ({}),
      useRouteContext: () => mockRouteContext,
    }),
  };
});

describe("_authenticated route", () => {
  it("AuthenticatedLayout renders sidebar, header, and outlet", async () => {
    const { Route } = await import("./_authenticated");
    const Layout = (Route.options.component as React.ComponentType);
    render(<Layout />);

    expect(screen.getByTestId("app-sidebar")).toBeTruthy();
    expect(screen.getByTestId("app-header")).toBeTruthy();
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  it("beforeLoad redirects when no user", async () => {
    const { getCurrentUserServerFn } = await import("~/lib/auth-client");
    (getCurrentUserServerFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { Route } = await import("./_authenticated");

    const beforeLoad = Route.options.beforeLoad as unknown as (args: Record<string, unknown>) => Promise<unknown>;
    await expect(
      beforeLoad({ context: {} })
    ).rejects.toMatchObject({ href: "/auth/login" });
  });

  it("beforeLoad returns user when authenticated", async () => {
    const { getCurrentUserServerFn } = await import("~/lib/auth-client");
    const user = { name: "Test", email: "t@t.com", image: null };
    (getCurrentUserServerFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const { Route } = await import("./_authenticated");

    const beforeLoad2 = Route.options.beforeLoad as unknown as (args: Record<string, unknown>) => Promise<unknown>;
    const result = await beforeLoad2({ context: {} });
    expect(result).toEqual({ user, theme: "system" });
  });

  it("AuthenticatedLayout renders ThemeProvider", async () => {
    const { Route } = await import("./_authenticated");
    const Layout = (Route.options.component as React.ComponentType);
    render(<Layout />);

    expect(screen.getByTestId("theme-provider")).toBeTruthy();
  });
});
