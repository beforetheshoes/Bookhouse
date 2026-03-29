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
  enrichment: { enriched: 8, unenriched: 7 },
  description: { withDescription: 6, withoutDescription: 9 },
  series: { inSeries: 4, standalone: 11 },
  isbn: { withIsbn: 10, withoutIsbn: 5 },
};

const defaultProps = {
  facetCounts: defaultFacetCounts,
  totalFacetCounts: defaultFacetCounts,
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
    expect(screen.getByText("Enrichment")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Series")).toBeTruthy();
    expect(screen.getByText("ISBN")).toBeTruthy();
  });

  it("renders enrichment filter buttons with counts", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("Enriched (8)")).toBeTruthy();
    expect(screen.getByText("Unenriched (7)")).toBeTruthy();
  });

  it("toggles enriched filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Enriched (8)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ enriched: true }));
  });

  it("toggles unenriched filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Unenriched (7)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ enriched: false }));
  });

  it("deselects enriched when already selected", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} filters={{ enriched: true }} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Enriched (8)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ enriched: undefined }));
  });

  it("renders description filter buttons with counts", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("Has Description (6)")).toBeTruthy();
    expect(screen.getByText("No Description (9)")).toBeTruthy();
  });

  it("toggles hasDescription filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Has Description (6)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ hasDescription: true }));
  });

  it("toggles no description filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("No Description (9)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ hasDescription: false }));
  });

  it("renders series filter buttons with counts", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("In Series (4)")).toBeTruthy();
    expect(screen.getByText("Standalone (11)")).toBeTruthy();
  });

  it("toggles inSeries filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("In Series (4)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ inSeries: true }));
  });

  it("toggles standalone filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Standalone (11)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ inSeries: false }));
  });

  it("renders ISBN filter buttons with counts", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("Has ISBN (10)")).toBeTruthy();
    expect(screen.getByText("No ISBN (5)")).toBeTruthy();
  });

  it("toggles hasIsbn filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("Has ISBN (10)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ hasIsbn: true }));
  });

  it("toggles no ISBN filter", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryFilters {...defaultProps} onFiltersChange={onFiltersChange} />);
    await user.click(screen.getByText("No ISBN (5)"));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ hasIsbn: false }));
  });

  it("shows clear all when new boolean filters are active", () => {
    render(<LibraryFilters {...defaultProps} filters={{ enriched: true }} />);
    expect(screen.getByText("Clear All")).toBeTruthy();
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

  it("shows single count when filtered equals total", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("EBOOK (10)")).toBeTruthy();
    expect(screen.queryByText(/\//)).toBeNull();
  });

  it("shows filtered / total when format counts differ", () => {
    const filteredCounts: FacetCounts = {
      ...defaultFacetCounts,
      format: [
        { formatFamily: "EBOOK", _count: { _all: 4 } },
        { formatFamily: "AUDIOBOOK", _count: { _all: 2 } },
      ],
    };
    render(
      <LibraryFilters
        {...defaultProps}
        facetCounts={filteredCounts}
        totalFacetCounts={defaultFacetCounts}
        filters={{ hasCover: true }}
      />,
    );
    expect(screen.getByText("EBOOK (4 / 10)")).toBeTruthy();
    expect(screen.getByText("AUDIOBOOK (2 / 5)")).toBeTruthy();
  });

  it("shows filtered / total for boolean facets when counts differ", () => {
    const filteredCounts: FacetCounts = {
      ...defaultFacetCounts,
      hasCover: { withCover: 4, withoutCover: 1 },
    };
    render(
      <LibraryFilters
        {...defaultProps}
        facetCounts={filteredCounts}
        totalFacetCounts={defaultFacetCounts}
        filters={{ format: ["EBOOK"] }}
      />,
    );
    expect(screen.getByText("With Cover (4 / 12)")).toBeTruthy();
    expect(screen.getByText("Without Cover (1 / 3)")).toBeTruthy();
  });

  it("shows single count for boolean facets when counts match", () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText("With Cover (12)")).toBeTruthy();
    expect(screen.getByText("Without Cover (3)")).toBeTruthy();
  });

  it("falls back to filtered count when format not found in totalFacetCounts", () => {
    const filteredCounts: FacetCounts = {
      ...defaultFacetCounts,
      format: [
        { formatFamily: "EBOOK", _count: { _all: 4 } },
      ],
    };
    const totalCounts: FacetCounts = {
      ...defaultFacetCounts,
      format: [], // no matching format in totals
    };
    render(
      <LibraryFilters
        {...defaultProps}
        facetCounts={filteredCounts}
        totalFacetCounts={totalCounts}
        filters={{ hasCover: true }}
      />,
    );
    // Falls back to filtered count since total format not found
    expect(screen.getByText("EBOOK (4)")).toBeTruthy();
  });

  it("always reserves space for clear all button", () => {
    const { container } = render(<LibraryFilters {...defaultProps} filters={{}} />);
    // Clear All button should exist but be invisible when no filters active
    const clearAllWrapper = container.querySelector("[data-testid='clear-all-spacer']");
    expect(clearAllWrapper).toBeTruthy();
  });

  it("makes clear all button visible when filters active", () => {
    const { container } = render(<LibraryFilters {...defaultProps} filters={{ format: ["EBOOK"] }} />);
    const clearAllBtn = container.querySelector("[data-testid='clear-all-spacer']");
    expect(clearAllBtn).toBeTruthy();
    expect(screen.getByText("Clear All")).toBeTruthy();
  });

  it("marks zero-count buttons as disabled-looking via data-empty", () => {
    const filteredCounts: FacetCounts = {
      ...defaultFacetCounts,
      hasCover: { withCover: 0, withoutCover: 5 },
    };
    render(
      <LibraryFilters
        {...defaultProps}
        facetCounts={filteredCounts}
        totalFacetCounts={defaultFacetCounts}
        filters={{ format: ["EBOOK"] }}
      />,
    );
    const withCoverBtn = screen.getByText("With Cover (0 / 12)").closest("button");
    expect(withCoverBtn?.getAttribute("data-empty")).toBe("true");
    const withoutCoverBtn = screen.getByText("Without Cover (5 / 3)").closest("button");
    expect(withoutCoverBtn?.getAttribute("data-empty")).toBe("false");
  });

  it("marks zero-count format buttons as disabled-looking via data-empty", () => {
    const filteredCounts: FacetCounts = {
      ...defaultFacetCounts,
      format: [
        { formatFamily: "EBOOK", _count: { _all: 0 } },
        { formatFamily: "AUDIOBOOK", _count: { _all: 5 } },
      ],
    };
    render(
      <LibraryFilters
        {...defaultProps}
        facetCounts={filteredCounts}
        totalFacetCounts={defaultFacetCounts}
        filters={{ hasCover: true }}
      />,
    );
    const ebookBtn = screen.getByText("EBOOK (0 / 10)").closest("button");
    expect(ebookBtn?.getAttribute("data-empty")).toBe("true");
  });
});
