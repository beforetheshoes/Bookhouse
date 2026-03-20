// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LibraryFilters } from "./library-filters";
import type { FacetCounts } from "./library-filters";

const defaultFacetCounts: FacetCounts = {
  format: [
    { formatFamily: "EBOOK", _count: { _all: 10 } },
    { formatFamily: "AUDIOBOOK", _count: { _all: 5 } },
  ],
  hasCover: { withCover: 12, withoutCover: 3 },
  series: 4,
};

const defaultProps = {
  facetCounts: defaultFacetCounts,
  filters: {},
  onFiltersChange: vi.fn(),
};

describe("LibraryFilters", () => {
  it("renders format filter buttons with counts", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("EBOOK (10)")).toBeTruthy();
    expect(screen.getByText("AUDIOBOOK (5)")).toBeTruthy();
  });

  it("calls onFiltersChange with format when format button clicked", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("EBOOK (10)"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: ["EBOOK"] }),
    );
  });

  it("deselects format when already selected", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryFilters
        {...defaultProps}
        filters={{ format: ["EBOOK"] }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await user.click(screen.getByText("EBOOK (10)"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: undefined }),
    );
  });

  it("renders has-cover filter buttons", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("With Cover (12)")).toBeTruthy();
    expect(screen.getByText("Without Cover (3)")).toBeTruthy();
  });

  it("calls onFiltersChange with hasCover true when clicked", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("With Cover (12)"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasCover: true }),
    );
  });

  it("calls onFiltersChange with hasCover false when clicked", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Without Cover (3)"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasCover: false }),
    );
  });

  it("deselects hasCover when already selected", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryFilters
        {...defaultProps}
        filters={{ hasCover: true }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await user.click(screen.getByText("With Cover (12)"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasCover: undefined }),
    );
  });

  it("renders clear all button when filters are active", () => {
    render(<LibraryFilters {...defaultProps} filters={{ format: ["EBOOK"] }} />);
    expect(screen.getByText("Clear All")).toBeTruthy();
  });

  it("does not render clear all button when no filters active", () => {
    render(<LibraryFilters {...defaultProps} filters={{}} />);
    expect(screen.queryByText("Clear All")).toBeNull();
  });

  it("calls onFiltersChange with empty object when clear all clicked", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryFilters
        {...defaultProps}
        filters={{ format: ["EBOOK"], hasCover: true }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await user.click(screen.getByText("Clear All"));
    expect(onFiltersChange).toHaveBeenCalledWith({});
  });

  it("renders section headings", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("Format")).toBeTruthy();
    expect(screen.getByText("Cover")).toBeTruthy();
  });

  it("shows active state on selected format button", () => {
    render(<LibraryFilters {...defaultProps} filters={{ format: ["EBOOK"] }} />);
    const ebookBtn = screen.getByText("EBOOK (10)").closest("button");
    expect(ebookBtn?.getAttribute("data-active")).toBe("true");
  });

  it("shows active state on selected hasCover button", () => {
    render(<LibraryFilters {...defaultProps} filters={{ hasCover: true }} />);
    const coverBtn = screen.getByText("With Cover (12)").closest("button");
    expect(coverBtn?.getAttribute("data-active")).toBe("true");
  });

  it("handles empty format facet counts", () => {
    render(
      <LibraryFilters
        {...defaultProps}
        facetCounts={{ ...defaultFacetCounts, format: [] }}
      />,
    );
    expect(screen.getByText("Format")).toBeTruthy();
  });

  it("shows clear all when authorId filter is active", () => {
    render(<LibraryFilters {...defaultProps} filters={{ authorId: ["a1"] }} />);
    expect(screen.getByText("Clear All")).toBeTruthy();
  });

  it("shows clear all when seriesId filter is active", () => {
    render(<LibraryFilters {...defaultProps} filters={{ seriesId: ["s1"] }} />);
    expect(screen.getByText("Clear All")).toBeTruthy();
  });

  it("shows clear all when publisher filter is active", () => {
    render(<LibraryFilters {...defaultProps} filters={{ publisher: ["Penguin"] }} />);
    expect(screen.getByText("Clear All")).toBeTruthy();
  });

  it("does not show clear all for empty arrays", () => {
    render(<LibraryFilters {...defaultProps} filters={{ format: [], authorId: [], seriesId: [], publisher: [] }} />);
    expect(screen.queryByText("Clear All")).toBeNull();
  });
});
