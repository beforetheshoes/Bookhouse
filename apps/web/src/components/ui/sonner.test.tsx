// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { Toaster } from "./sonner";

vi.mock("sonner", () => ({
  Toaster: ({ theme, className: _className, icons: _icons, style: _style, ...props }: any) => (
    <div data-testid="toaster" data-theme={theme} {...props} />
  ),
}));

it('renders the Toaster with theme="light"', () => {
  render(<Toaster />);
  const toaster = screen.getByTestId("toaster");
  expect(toaster).toBeTruthy();
  expect(toaster.getAttribute("data-theme")).toBe("light");
});
