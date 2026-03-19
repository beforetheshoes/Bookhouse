// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "./progress";

it("renders a progressbar with correct aria attributes", () => {
  render(<Progress value={42} max={100} />);
  const el = screen.getByRole("progressbar");
  expect(el.getAttribute("aria-valuenow")).toBe("42");
  expect(el.getAttribute("aria-valuemin")).toBe("0");
  expect(el.getAttribute("aria-valuemax")).toBe("100");
});

it("clamps percentage between 0 and 100", () => {
  render(<Progress value={150} max={100} />);
  const el = screen.getByRole("progressbar");
  const inner = el.firstElementChild as HTMLElement;
  expect(inner.style.transform).toBe("translateX(-0%)");
});

it("renders with default values when no props provided", () => {
  render(<Progress />);
  const el = screen.getByRole("progressbar");
  expect(el.getAttribute("aria-valuenow")).toBe("0");
  expect(el.getAttribute("aria-valuemax")).toBe("100");
});

it("applies custom className", () => {
  render(<Progress className="custom-class" />);
  const el = screen.getByRole("progressbar");
  expect(el.className).toContain("custom-class");
});
