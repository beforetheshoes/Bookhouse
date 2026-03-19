// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { GridPageSkeleton } from "./grid-page-skeleton";

it("renders skeleton heading", () => {
  render(<GridPageSkeleton />);
  const skeletons = screen.getAllByTestId("skeleton-card");
  expect(skeletons.length).toBeGreaterThan(0);
});

it("renders toolbar skeleton", () => {
  render(<GridPageSkeleton />);
  expect(screen.getByTestId("skeleton-toolbar")).toBeTruthy();
});
