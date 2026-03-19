// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mockRouteContext = { user: { name: "Test User", email: "test@test.com", image: null } };

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

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
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
      useLoaderData: () => ({}),
      useRouteContext: () => mockRouteContext,
    }),
  };
});

describe("_authenticated route", () => {
  it("AuthenticatedLayout renders sidebar, header, and outlet", async () => {
    const { Route } = await import("./_authenticated");
    const Layout = Route.component!;
    render(<Layout />);

    expect(screen.getByTestId("app-sidebar")).toBeTruthy();
    expect(screen.getByTestId("app-header")).toBeTruthy();
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  it("beforeLoad redirects when no user", async () => {
    const { getCurrentUserServerFn } = await import("~/lib/auth-client");
    (getCurrentUserServerFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { Route } = await import("./_authenticated");

    await expect(
      Route.beforeLoad({ context: {} } as Parameters<NonNullable<typeof Route.beforeLoad>>[0])
    ).rejects.toMatchObject({ href: "/auth/login" });
  });

  it("beforeLoad returns user when authenticated", async () => {
    const { getCurrentUserServerFn } = await import("~/lib/auth-client");
    const user = { name: "Test", email: "t@t.com", image: null };
    (getCurrentUserServerFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const { Route } = await import("./_authenticated");

    const result = await Route.beforeLoad({ context: {} } as Parameters<NonNullable<typeof Route.beforeLoad>>[0]);
    expect(result).toEqual({ user });
  });
});
