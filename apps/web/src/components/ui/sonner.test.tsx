// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toaster } from "./sonner";

vi.mock("sonner", () => ({
  Toaster: ({ theme, className: _className, icons: _icons, style: _style, ...props }: { theme?: string; className?: string; icons?: object; style?: React.CSSProperties; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) | object }) => (
    <div data-testid="toaster" data-theme={theme} {...props} />
  ),
}));

it('renders the Toaster with theme="light"', () => {
  render(<Toaster />);
  const toaster = screen.getByTestId("toaster");
  expect(toaster).toBeTruthy();
  expect(toaster.getAttribute("data-theme")).toBe("light");
});
