// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Textarea } from "./textarea";

it("renders a textarea element", () => {
  const { container } = render(<Textarea placeholder="Type here" />);
  expect(container.querySelector("textarea")).toBeTruthy();
});

it("renders with the correct placeholder", () => {
  const { container } = render(<Textarea placeholder="Enter description..." />);
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  expect(textarea.placeholder).toBe("Enter description...");
});

it("renders with the data-slot attribute", () => {
  const { container } = render(<Textarea />);
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  expect(textarea.getAttribute("data-slot")).toBe("textarea");
});

it("applies custom className", () => {
  const { container } = render(<Textarea className="custom-class" />);
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  expect(textarea.className).toContain("custom-class");
});
