// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...props }: { children?: React.ReactNode; to: string; params?: Record<string, string>; [key: string]: unknown }) => {
    const href = params ? to.replace("$workId", params.workId ?? "") : to;
    return <a href={href} {...props}>{children}</a>;
  },
}));

import { WorkCard } from "./work-card";

describe("WorkCard", () => {
  const baseProps = {
    id: "work-123",
    title: "The Great Gatsby",
    authors: "F. Scott Fitzgerald",
    formats: ["EBOOK"],
  };

  it("renders the title", () => {
    render(<WorkCard {...baseProps} />);
    expect(screen.getByText("The Great Gatsby")).toBeTruthy();
  });

  it("renders the authors", () => {
    render(<WorkCard {...baseProps} />);
    expect(screen.getByText("F. Scott Fitzgerald")).toBeTruthy();
  });

  it("renders format badges", () => {
    render(<WorkCard {...baseProps} formats={["EBOOK", "AUDIOBOOK"]} />);
    expect(screen.getByText("EBOOK")).toBeTruthy();
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
  });

  it("renders series badge when provided", () => {
    render(<WorkCard {...baseProps} series="Classics" />);
    expect(screen.getByText("Classics")).toBeTruthy();
  });

  it("does not render series badge when null", () => {
    render(<WorkCard {...baseProps} series={null} />);
    expect(screen.queryByTestId("series-badge")).toBeNull();
  });

  it("does not render series badge when undefined", () => {
    render(<WorkCard {...baseProps} />);
    expect(screen.queryByTestId("series-badge")).toBeNull();
  });

  it("renders cover image with correct src and lazy loading when coverPath is set", () => {
    render(<WorkCard {...baseProps} coverPath="work-123" />);
    const img = screen.getByRole("img", { name: "The Great Gatsby" });
    expect(img.getAttribute("src")).toBe("/api/covers/work-123/thumb");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("renders placeholder when coverPath is null", () => {
    render(<WorkCard {...baseProps} coverPath={null} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders placeholder when coverPath is undefined", () => {
    render(<WorkCard {...baseProps} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("falls back to placeholder when image fails to load", () => {
    render(<WorkCard {...baseProps} coverPath="work-123" />);
    const img = screen.getByRole("img", { name: "The Great Gatsby" });
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("wraps card in a link to the work detail page", () => {
    render(<WorkCard {...baseProps} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/library/work-123");
  });

  it("shows processing badge when enrichmentStatus is STUB", () => {
    render(<WorkCard {...baseProps} enrichmentStatus="STUB" />);
    expect(screen.getByText("Processing\u2026")).toBeTruthy();
  });

  it("does not show processing badge when enrichmentStatus is ENRICHED", () => {
    render(<WorkCard {...baseProps} enrichmentStatus="ENRICHED" />);
    expect(screen.queryByText("Processing\u2026")).toBeNull();
  });

  it("does not show processing badge when enrichmentStatus is not provided", () => {
    render(<WorkCard {...baseProps} />);
    expect(screen.queryByText("Processing\u2026")).toBeNull();
  });

  it("renders progress bar when progressPercent is provided", () => {
    render(<WorkCard {...baseProps} progressPercent={42} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("does not render progress bar when progressPercent is null", () => {
    render(<WorkCard {...baseProps} progressPercent={null} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not render progress bar when progressPercent is undefined", () => {
    render(<WorkCard {...baseProps} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
