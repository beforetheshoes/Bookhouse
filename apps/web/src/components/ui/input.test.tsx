// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Input } from "./input";

it("renders an input element", () => {
  const { container } = render(<Input placeholder="Type here" />);
  expect(container.querySelector("input")).toBeTruthy();
});

it("renders with the correct placeholder", () => {
  const { container } = render(<Input placeholder="Search..." />);
  const input = container.querySelector("input") as HTMLInputElement;
  expect(input.placeholder).toBe("Search...");
});

it("renders with the data-slot attribute", () => {
  const { container } = render(<Input />);
  const input = container.querySelector("input") as HTMLInputElement;
  expect(input.getAttribute("data-slot")).toBe("input");
});

it("passes type prop to input element", () => {
  const { container } = render(<Input type="password" />);
  const input = container.querySelector("input") as HTMLInputElement;
  expect(input.type).toBe("password");
});
