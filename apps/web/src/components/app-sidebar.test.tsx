// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SidebarProvider } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    useRouterState: () => ({ location: { pathname: "/library" } }),
  };
});

const mockUser = { name: "John Doe", email: "john@example.com", image: null };

function renderSidebar(user: { name: string | null; email: string | null; image: string | null } = mockUser) {
  return render(
    <SidebarProvider>
      <AppSidebar user={user as Parameters<typeof AppSidebar>[0]["user"]} />
    </SidebarProvider>
  );
}

describe("AppSidebar", () => {
  it("renders navigation items", () => {
    renderSidebar();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("Series")).toBeTruthy();
    expect(screen.getByText("Authors")).toBeTruthy();
    expect(screen.getByText("Shelves")).toBeTruthy();
    expect(screen.getByText("Duplicates")).toBeTruthy();
    expect(screen.getByText("Match Suggestions")).toBeTruthy();
    expect(screen.getByText("Library Health")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("shows user name and email", () => {
    renderSidebar();
    expect(screen.getByText("John Doe")).toBeTruthy();
    expect(screen.getByText("john@example.com")).toBeTruthy();
  });

  it("shows initials 'JD' for 'John Doe'", () => {
    renderSidebar({ name: "John Doe", email: "john@example.com", image: null });
    expect(screen.getByText("JD")).toBeTruthy();
  });

  it("shows initial from email when name is null", () => {
    renderSidebar({ name: null, email: "alice@test.com", image: null });
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("shows '?' when both name and email are null", () => {
    renderSidebar({ name: null, email: null, image: null });
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("renders Bookhouse brand link", () => {
    renderSidebar();
    expect(screen.getByText("Bookhouse")).toBeTruthy();
  });
});
