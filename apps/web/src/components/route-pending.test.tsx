// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RoutePending } from "./route-pending";

it("renders a loading spinner", () => {
  const { container } = render(<RoutePending />);
  expect(container.querySelector("svg")).toBeTruthy();
});
