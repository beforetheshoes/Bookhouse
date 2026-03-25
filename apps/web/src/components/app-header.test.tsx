// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarProvider } from "./ui/sidebar";
import { AppHeader, ThemeToggle } from "./app-header";

const mockToggleTheme = vi.fn();
let mockResolvedTheme = "light";

vi.mock("~/hooks/use-theme", () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
    toggleTheme: mockToggleTheme,
  }),
}));

vi.mock("./global-search", () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}));

it("renders the app header", () => {
  const { container } = render(
    <SidebarProvider>
      <AppHeader />
    </SidebarProvider>
  );
  expect(container.querySelector("header")).toBeTruthy();
});

it("renders the global search component", () => {
  render(
    <SidebarProvider>
      <AppHeader />
    </SidebarProvider>
  );
  expect(screen.getByTestId("global-search")).toBeTruthy();
});

it("renders the theme toggle button", () => {
  render(
    <SidebarProvider>
      <AppHeader />
    </SidebarProvider>
  );
  expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeTruthy();
});

it("ThemeToggle shows Moon icon in light mode", () => {
  mockResolvedTheme = "light";
  render(<ThemeToggle />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
});

it("ThemeToggle shows Sun icon in dark mode", () => {
  mockResolvedTheme = "dark";
  render(<ThemeToggle />);
  expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
});

it("ThemeToggle calls toggleTheme on click", () => {
  mockResolvedTheme = "light";
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(mockToggleTheme).toHaveBeenCalled();
});
