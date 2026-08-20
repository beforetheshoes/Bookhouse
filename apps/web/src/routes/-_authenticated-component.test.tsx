// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { takePendingUploadFiles } from "~/lib/pending-upload";

/** Cast route option function types that have no overlap with simple function types */
function asBeforeLoad<TArgs, TResult>(fn: ((args: TArgs) => Promise<TResult>) | object): (args: TArgs) => Promise<TResult> {
  return fn as ((args: TArgs) => Promise<TResult>) & typeof fn;
}

const mockRouteContext = { user: { name: "Test User", email: "test@test.com", image: null, roles: ["OWNER"] as string[] }, theme: "system" as const, colorMode: "book" as const, accentColor: null };

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

beforeEach(() => {
  navigateMock.mockReset();
  mockRouteContext.user.roles = ["OWNER"];
  takePendingUploadFiles();
});

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

vi.mock("~/hooks/use-app-color", () => ({
  AppColorProvider: ({ children }: { children?: React.ReactNode }) => <div data-testid="app-color-provider">{children}</div>,
}));

vi.mock("~/lib/server-fns/app-settings", () => ({
  getThemeServerFn: vi.fn().mockResolvedValue("system"),
  getColorModeServerFn: vi.fn().mockResolvedValue("book"),
  getAccentColorServerFn: vi.fn().mockResolvedValue(null),
  getBrandPaletteServerFn: vi.fn().mockResolvedValue("shelf"),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: navigateMock }),
    redirect: (args: Record<string, string>) => {
      const e = Object.assign(new Error("redirect"), args);
      throw e;
    },
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
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

  it("AuthenticatedLayout gives main mobile-first padding", async () => {
    const { Route } = await import("./_authenticated");
    const Layout = (Route.options.component as React.ComponentType);
    const { container } = render(<Layout />);

    const main = container.querySelector("main");
    expect(main).toBeTruthy();
    // p-6 on a 375px phone costs 48px of a 327px content budget.
    expect(main?.className).toContain("p-4");
    expect(main?.className).toContain("md:p-6");
  });

  it("beforeLoad redirects when no user", async () => {
    const { getCurrentUserServerFn } = await import("~/lib/auth-client");
    (vi.mocked(getCurrentUserServerFn)).mockResolvedValue(null);

    const { Route } = await import("./_authenticated");

    const beforeLoad = asBeforeLoad<Record<string, string | object>, object>(Route.options.beforeLoad as object);
    await expect(
      beforeLoad({ context: {} })
    ).rejects.toMatchObject({ href: "/auth/login" });
  });

  it("beforeLoad returns user when authenticated", async () => {
    const { getCurrentUserServerFn } = await import("~/lib/auth-client");
    const user = { id: "u1", name: "Test", email: "t@t.com", image: null, issuer: "test", subject: "s1", roles: ["OWNER"] };
    (vi.mocked(getCurrentUserServerFn)).mockResolvedValue(user);

    const { Route } = await import("./_authenticated");

    const beforeLoad2 = asBeforeLoad<Record<string, string | object>, object>(Route.options.beforeLoad as object);
    const result = await beforeLoad2({ context: {} });
    expect(result).toEqual({ user, theme: "system", colorMode: "book", accentColor: null, brandPalette: "shelf" });
  });

  it("AuthenticatedLayout renders ThemeProvider", async () => {
    const { Route } = await import("./_authenticated");
    const Layout = (Route.options.component as React.ComponentType);
    render(<Layout />);

    expect(screen.getByTestId("theme-provider")).toBeTruthy();
  });

  it("stashes files dropped anywhere and navigates to /upload for owners", async () => {
    const { Route } = await import("./_authenticated");
    const Layout = (Route.options.component as React.ComponentType);
    const { unmount } = render(<Layout />);

    const file = new File(["x"], "dropped-anywhere.epub");
    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"], files: [] } });
    expect(screen.getByTestId("global-drop-overlay")).toBeTruthy();
    fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [file] } });

    expect(navigateMock).toHaveBeenCalledWith({ to: "/upload" });
    expect(takePendingUploadFiles().map((f) => f.name)).toEqual(["dropped-anywhere.epub"]);
    unmount();
  });

  it("ignores global file drops for non-owners", async () => {
    mockRouteContext.user.roles = ["VIEWER"];
    const { Route } = await import("./_authenticated");
    const Layout = (Route.options.component as React.ComponentType);
    const { unmount } = render(<Layout />);

    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"], files: [] } });
    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    fireEvent.drop(window, {
      dataTransfer: { types: ["Files"], files: [new File(["x"], "n.epub")] },
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(takePendingUploadFiles()).toEqual([]);
    unmount();
  });
});
