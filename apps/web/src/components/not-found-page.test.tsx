// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotFoundPage } from "./not-found-page";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    useRouterState: () => ({ location: { pathname: "/" } }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

it('renders "Page not found" text', () => {
  render(<NotFoundPage />);
  expect(screen.getByText("Page not found")).toBeTruthy();
});

it("renders a link to /", () => {
  render(<NotFoundPage />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/");
});

it('renders "Go home" button text', () => {
  render(<NotFoundPage />);
  expect(screen.getByText("Go home")).toBeTruthy();
});
