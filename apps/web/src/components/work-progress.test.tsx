// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("~/components/progress-bar", () => ({
  ProgressBar: ({ percent }: { percent: number }) => (
    <div data-testid="progress-bar" data-percent={percent} />
  ),
}));

import { WorkProgress } from "./work-progress";

describe("WorkProgress", () => {
  it("renders progress bar with max percent", () => {
    render(<WorkProgress progress={[{ percent: 50 }, { percent: 75 }]} />);
    const bar = screen.getByTestId("progress-bar");
    expect(bar.getAttribute("data-percent")).toBe("75");
  });

  it("renders percentage text", () => {
    render(<WorkProgress progress={[{ percent: 42 }]} />);
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("treats null percent as 0", () => {
    render(<WorkProgress progress={[{ percent: null }, { percent: 30 }]} />);
    const bar = screen.getByTestId("progress-bar");
    expect(bar.getAttribute("data-percent")).toBe("30");
  });

  it("renders separate rows when multiple sources exist", () => {
    render(
      <WorkProgress
        progress={[
          { percent: 40, source: "manual" },
          { percent: 60, source: "koreader" },
        ]}
      />,
    );

    expect(screen.getByText(/via\s+manual/i)).toBeTruthy();
    expect(screen.getByText(/via\s+koreader/i)).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
  });
});
