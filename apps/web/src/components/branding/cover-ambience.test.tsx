// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CoverAmbience } from "./cover-ambience";

describe("CoverAmbience", () => {
  it("renders two radial glow layers consuming the signature CSS vars", () => {
    render(<CoverAmbience />);
    const root = screen.getByTestId("cover-ambience");
    const glows = root.querySelectorAll("div");
    expect(glows).toHaveLength(2);
    expect(glows[0]?.style.background).toContain("var(--bh-glow, transparent)");
    expect(glows[1]?.style.background).toContain("var(--bh-accent, transparent)");
  });

  it("is decorative — aria-hidden and pointer-events disabled", () => {
    render(<CoverAmbience />);
    const root = screen.getByTestId("cover-ambience");
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
  });
});
