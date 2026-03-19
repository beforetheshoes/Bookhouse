// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { SidebarProvider } from "./ui/sidebar";
import { AppHeader } from "./app-header";

it("renders the app header", () => {
  const { container } = render(
    <SidebarProvider>
      <AppHeader />
    </SidebarProvider>
  );
  expect(container.querySelector("header")).toBeTruthy();
});
