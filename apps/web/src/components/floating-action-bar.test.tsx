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

  it("stays inside the viewport on phones and centres from md up", () => {
    const { container } = render(<FloatingActionBar>bar</FloatingActionBar>);
    const bar = container.firstElementChild;

    // `left-1/2 -translate-x-1/2` on a ~700px row overflows a 360px viewport
    // off BOTH edges, and a fixed element cannot be scrolled back into view.
    expect(bar?.className).toContain("inset-x-2");
    expect(bar?.className).toContain("max-w-[calc(100vw-1rem)]");
    expect(bar?.className).toContain("md:left-1/2");
    expect(bar?.className).toContain("md:-translate-x-1/2");
  });

  it("forwards extra props such as a test id", () => {
    render(<FloatingActionBar data-testid="selection-bar">bar</FloatingActionBar>);
    expect(screen.getByTestId("selection-bar")).toBeTruthy();
  });
});
