// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookhouseWordmark } from "./bookhouse-wordmark";

describe("BookhouseWordmark", () => {
  it("renders 'Bookhouse' in Fraunces", () => {
    render(<BookhouseWordmark />);
    const text = screen.getByText("Bookhouse");
    expect(text).toBeTruthy();
    expect(text.style.fontFamily).toContain("Fraunces");
    expect(text.style.fontWeight).toBe("500");
  });

  it("scales text and gap with the size prop", () => {
    render(<BookhouseWordmark size={100} />);
    const wordmark = screen.getByTestId("bookhouse-wordmark");
    expect(wordmark.style.gap).toBe("35px");
    const text = screen.getByText("Bookhouse");
    expect(text.style.fontSize).toBe("68px");
  });

  it("uses cream text color in dark mode", () => {
    render(<BookhouseWordmark dark />);
    expect(screen.getByTestId("bookhouse-wordmark").style.color.toLowerCase()).toBe("#f3ede0");
  });

  it("uses ink text color by default", () => {
    render(<BookhouseWordmark />);
    expect(screen.getByTestId("bookhouse-wordmark").style.color.toLowerCase()).toBe("#15140f");
  });

  it("forwards palette to the mark", () => {
    render(<BookhouseWordmark paletteKey="vivid" />);
    const svg = screen.getByTestId("bookhouse-mark");
    // First bar of vivid palette is hot pink
    const bars = svg.querySelectorAll("rect");
    expect(bars[3]?.getAttribute("fill")).toBe("#ff4d6d");
  });
});
