// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

it("renders a skeleton element", () => {
  const { container } = render(<Skeleton className="h-4 w-24" />);
  expect(container.firstChild).toBeTruthy();
});

it("renders with the data-slot attribute", () => {
  const { container } = render(<Skeleton />);
  const el = container.firstChild as HTMLElement;
  expect(el.getAttribute("data-slot")).toBe("skeleton");
});

it("passes className to the rendered element", () => {
  const { container } = render(<Skeleton className="h-8 w-48" />);
  const el = container.firstChild as HTMLElement;
  expect(el.className).toContain("h-8");
  expect(el.className).toContain("w-48");
});
