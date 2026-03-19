// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "./separator";

it("renders horizontal separator", () => {
  const { container } = render(<Separator />);
  expect(container.firstChild).toBeTruthy();
});

it("renders with default horizontal data-orientation attribute", () => {
  const { container } = render(<Separator />);
  const el = container.firstChild as HTMLElement;
  expect(el.getAttribute("data-orientation")).toBe("horizontal");
});

it("renders vertical separator with correct data-orientation attribute", () => {
  const { container } = render(<Separator orientation="vertical" />);
  const el = container.firstChild as HTMLElement;
  expect(el.getAttribute("data-orientation")).toBe("vertical");
});
