// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./button";

it("renders button element with children", () => {
  render(<Button>Click me</Button>);
  const btn = screen.getByRole("button", { name: "Click me" });
  expect(btn).toBeTruthy();
  expect(btn.tagName.toLowerCase()).toBe("button");
});

it("handles click events", () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  fireEvent.click(screen.getByRole("button"));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

it("renders with asChild as the child element", () => {
  render(
    <Button asChild>
      <a href="/test">Link Button</a>
    </Button>
  );
  const link = screen.getByText("Link Button");
  expect(link.tagName.toLowerCase()).toBe("a");
  expect(link.getAttribute("href")).toBe("/test");
});

it("renders with different variants via data-variant attribute", () => {
  render(<Button variant="destructive">Destructive</Button>);
  const btn = screen.getByRole("button");
  expect(btn.getAttribute("data-variant")).toBe("destructive");
});

it("renders with different sizes via data-size attribute", () => {
  render(<Button size="lg">Large</Button>);
  const btn = screen.getByRole("button");
  expect(btn.getAttribute("data-size")).toBe("lg");
});

// Touch targets: every size is mobile-first and taller on phones, with `md:`
// restoring the exact desktop pixels the app was designed around.
it.each([
  ["default", "h-10", "md:h-9"],
  ["xs", "h-8", "md:h-6"],
  ["sm", "h-9", "md:h-8"],
  ["lg", "h-11", "md:h-10"],
  ["icon", "size-11", "md:size-9"],
  ["icon-xs", "size-8", "md:size-6"],
  ["icon-sm", "size-9", "md:size-8"],
  ["icon-lg", "size-11", "md:size-10"],
] as const)(
  "size %s is %s on mobile and %s from md up",
  (size, mobileClass, desktopClass) => {
    render(<Button size={size}>Sized</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain(mobileClass);
    expect(btn.className).toContain(desktopClass);
  }
);
