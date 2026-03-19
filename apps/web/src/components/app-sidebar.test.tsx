// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SidebarProvider } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    useRouterState: () => ({ location: { pathname: "/library" } }),
  };
});

const mockUser = { name: "John Doe", email: "john@example.com", image: null };

function renderSidebar(user = mockUser) {
  return render(
    <SidebarProvider>
      <AppSidebar user={user as any} />
    </SidebarProvider>
  );
}

describe("AppSidebar", () => {
  it("renders navigation items", () => {
    renderSidebar();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("Collections")).toBeTruthy();
    expect(screen.getByText("Duplicates")).toBeTruthy();
    expect(screen.getByText("Audio Links")).toBeTruthy();
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
