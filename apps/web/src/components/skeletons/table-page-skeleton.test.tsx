// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TablePageSkeleton } from "./table-page-skeleton";

it("renders without crashing", () => {
  const { container } = render(<TablePageSkeleton />);
  expect(container.firstChild).toBeTruthy();
});

it("renders 4 header skeleton items", () => {
  const { container } = render(<TablePageSkeleton />);
  // The header border-b row has 4 skeletons with class h-4 w-24
  const headerRow = container.querySelector(".border-b.px-4.py-3");
  const headerSkeletons = headerRow?.querySelectorAll('[data-slot="skeleton"]');
  expect(headerSkeletons?.length).toBe(4);
});

it("renders 8 row skeleton items", () => {
  const { container } = render(<TablePageSkeleton />);
  // Each of the 8 data rows uses "border-b px-4 py-3 last:border-b-0"
  const rowContainers = container.querySelectorAll(".border-b.px-4.py-3.last\\:border-b-0");
  expect(rowContainers.length).toBe(8);
});
