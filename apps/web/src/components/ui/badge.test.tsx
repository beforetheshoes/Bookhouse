// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

it("renders badge with default variant", () => {
  render(<Badge>Label</Badge>);
  expect(screen.getByText("Label")).toBeTruthy();
});

it("renders children text", () => {
  render(<Badge>Hello World</Badge>);
  expect(screen.getByText("Hello World")).toBeTruthy();
});

it("renders with secondary variant and correct data-variant attribute", () => {
  render(<Badge variant="secondary">Secondary</Badge>);
  const el = screen.getByText("Secondary");
  expect(el.getAttribute("data-variant")).toBe("secondary");
});

it("renders with asChild=true as the child element", () => {
  render(
    <Badge asChild>
      <a href="/test">Link Badge</a>
    </Badge>
  );
  const link = screen.getByText("Link Badge");
  expect(link.tagName.toLowerCase()).toBe("a");
  expect(link.getAttribute("href")).toBe("/test");
});
