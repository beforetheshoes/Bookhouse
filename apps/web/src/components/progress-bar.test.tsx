// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("returns null when percent is null", () => {
    const { container } = render(<ProgressBar percent={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when percent is undefined", () => {
    const { container } = render(<ProgressBar percent={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders progressbar role with aria attributes", () => {
    render(<ProgressBar percent={42} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("sets width style on filled portion", () => {
    render(<ProgressBar percent={75} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("75%");
  });

  it("renders green fill at 100%", () => {
    render(<ProgressBar percent={100} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-green-500");
  });

  it("renders primary fill below 100%", () => {
    render(<ProgressBar percent={50} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-primary");
    expect(fill.className).not.toContain("bg-green-500");
  });

  it("renders at 0%", () => {
    render(<ProgressBar percent={0} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("renders with h-0.5 class by default (sm)", () => {
    render(<ProgressBar percent={50} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.className).toContain("h-0.5");
  });

  it("renders with h-1.5 class when size is md", () => {
    render(<ProgressBar percent={50} size="md" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.className).toContain("h-1.5");
    expect(bar.className).not.toContain("h-0.5");
  });
});
