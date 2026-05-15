// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookhouseMark, BookhouseMarkMono } from "./bookhouse-mark";
import { PALETTES } from "./palettes";

describe("BookhouseMark", () => {
  it("renders seven bars plus the anchor spine using the shelf palette by default", () => {
    const { getByTestId } = render(<BookhouseMark />);
    const svg = getByTestId("bookhouse-mark");
    const rects = svg.querySelectorAll("rect");
    // 1 anchor spine + 2 title bands + 7 bars = 10
    expect(rects.length).toBe(10);
    const bars = Array.from(rects).slice(3);
    bars.forEach((bar, i) => {
      expect(bar.getAttribute("fill")).toBe(PALETTES.shelf.bars[i]);
    });
  });

  it("uses the requested palette", () => {
    const { getByTestId } = render(<BookhouseMark paletteKey="vivid" />);
    const rects = Array.from(getByTestId("bookhouse-mark").querySelectorAll("rect")).slice(3);
    expect(rects[0]?.getAttribute("fill")).toBe(PALETTES.vivid.bars[0]);
  });

  it("inverts spine color in dark mode", () => {
    const { getByTestId } = render(<BookhouseMark dark />);
    const spine = getByTestId("bookhouse-mark").querySelector("rect");
    expect(spine?.getAttribute("fill")).toBe("#f3ede0");
  });

  it("omits the shelf line when shelf={false}", () => {
    const { getByTestId } = render(<BookhouseMark shelf={false} />);
    expect(getByTestId("bookhouse-mark").querySelector("line")).toBeNull();
  });

  it("draws the shelf line by default", () => {
    const { getByTestId } = render(<BookhouseMark />);
    expect(getByTestId("bookhouse-mark").querySelector("line")).not.toBeNull();
  });

  it("exposes title as an aria-label when provided", () => {
    const { getByTestId } = render(<BookhouseMark title="Bookhouse" />);
    const svg = getByTestId("bookhouse-mark");
    expect(svg.getAttribute("aria-label")).toBe("Bookhouse");
    expect(svg.getAttribute("role")).toBe("img");
  });

  it("respects the size prop", () => {
    const { getByTestId } = render(<BookhouseMark size={128} />);
    const svg = getByTestId("bookhouse-mark");
    expect(svg.getAttribute("width")).toBe("128");
    expect(svg.getAttribute("height")).toBe("128");
  });
});

describe("BookhouseMarkMono", () => {
  it("paints every shape in a single color", () => {
    const { getByTestId } = render(<BookhouseMarkMono color="#abcdef" />);
    const svg = getByTestId("bookhouse-mark-mono");
    const rects = svg.querySelectorAll("rect");
    rects.forEach((rect) => {
      expect(rect.getAttribute("fill")).toBe("#abcdef");
    });
    expect(svg.querySelector("line")?.getAttribute("stroke")).toBe("#abcdef");
  });

  it("renders a background tile when bg is provided", () => {
    const { getByTestId } = render(<BookhouseMarkMono bg="#000" />);
    const firstRect = getByTestId("bookhouse-mark-mono").querySelector("rect");
    expect(firstRect?.getAttribute("fill")).toBe("#000");
    expect(firstRect?.getAttribute("width")).toBe("64");
  });

  it("omits the background tile by default", () => {
    const { getByTestId } = render(<BookhouseMarkMono />);
    const firstRect = getByTestId("bookhouse-mark-mono").querySelector("rect");
    expect(firstRect?.getAttribute("width")).toBe("11");
  });

  it("uses default size and color", () => {
    const { getByTestId } = render(<BookhouseMarkMono />);
    const svg = getByTestId("bookhouse-mark-mono");
    expect(svg.getAttribute("width")).toBe("64");
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("#15140f");
  });

  it("exposes title as an aria-label when provided", () => {
    const { getByTestId } = render(<BookhouseMarkMono title="Bookhouse" />);
    const svg = getByTestId("bookhouse-mark-mono");
    expect(svg.getAttribute("aria-label")).toBe("Bookhouse");
    expect(svg.getAttribute("role")).toBe("img");
  });
});
