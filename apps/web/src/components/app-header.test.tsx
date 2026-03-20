// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "./ui/sidebar";
import { AppHeader } from "./app-header";

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
