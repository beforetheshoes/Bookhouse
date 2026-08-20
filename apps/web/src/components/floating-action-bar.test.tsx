// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FloatingActionBar } from "./floating-action-bar";

describe("FloatingActionBar", () => {
  it("renders its children", () => {
    render(
      <FloatingActionBar>
        <button type="button">Delete</button>
      </FloatingActionBar>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("keeps a caller's classes alongside its own", () => {
    const { container } = render(
      <FloatingActionBar className="border-destructive">bar</FloatingActionBar>,
    );
    expect(container.firstElementChild?.className).toContain("border-destructive");
  });

  // Nothing here asserts on the responsive classes. happy-dom loads no
  // stylesheet and performs no layout, so `toContain("md:left-1/2")` passed
  // for as long as the bar was 884px wide and clipped off both edges between
  // 768 and ~900px. That geometry is measured in a browser instead, at five
  // widths, in e2e/touch-band.spec.ts.

  it("forwards extra props such as a test id", () => {
    render(<FloatingActionBar data-testid="selection-bar">bar</FloatingActionBar>);
    expect(screen.getByTestId("selection-bar")).toBeTruthy();
  });
});
