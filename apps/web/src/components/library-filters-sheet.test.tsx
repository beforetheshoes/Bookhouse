// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { FacetCounts, LibraryFilterValues } from "./library-filters";
import { LibraryFiltersSheet } from "./library-filters-sheet";

vi.mock("./library-filters", () => ({
  LibraryFilters: () => <div data-testid="library-filters" />,
}));

const facetCounts: FacetCounts = {
  format: [{ formatFamily: "EBOOK", _count: { _all: 3 } }],
  hasCover: { withCover: 2, withoutCover: 1 },
  enrichment: { enriched: 1, unenriched: 2 },
  description: { withDescription: 1, withoutDescription: 2 },
  series: { inSeries: 1, standalone: 2 },
};

function renderSheet(
  filters: LibraryFilterValues = {},
  overrides: Partial<React.ComponentProps<typeof LibraryFiltersSheet>> = {},
) {
  return render(
    <LibraryFiltersSheet
      facetCounts={facetCounts}
      totalFacetCounts={facetCounts}
      filters={filters}
      onFiltersChange={vi.fn()}
      filterValue="all"
      onFilterChange={vi.fn()}
      sortValue="title-asc"
      onSortChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("LibraryFiltersSheet", () => {
  it("renders a trigger that is hidden from lg up", () => {
    renderSheet();
    const trigger = screen.getByRole("button", { name: /Filters/ });
    expect(trigger.className).toContain("lg:hidden");
  });

  it("shows no badge when no filters are active", () => {
    renderSheet();
    expect(screen.queryByTestId("active-filter-count")).toBeNull();
  });

  it("badges the trigger with the number of active filters", () => {
    renderSheet({ format: ["EBOOK"], hasCover: true });
    expect(screen.getByTestId("active-filter-count").textContent).toBe("2");
  });

  it("changes reading status from inside the sheet", async () => {
    // Below lg the toolbar has no room for these two selects, so the sheet is
    // the only way to reach them.
    const onFilterChange = vi.fn();
    const user = userEvent.setup();
    renderSheet({}, { onFilterChange });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Reading status" }));
    await user.click(screen.getByText("Finished"));
    expect(onFilterChange).toHaveBeenCalledWith("finished");
  });

  it("changes sort from inside the sheet", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderSheet({}, { onSortChange });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(screen.getByText("Recently Added"));
    expect(onSortChange).toHaveBeenCalledWith("recent");
  });

  it("omits sort when the view sorts by its own column headers", async () => {
    const user = userEvent.setup();
    renderSheet({}, { sortValue: undefined, onSortChange: undefined });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.queryByRole("combobox", { name: "Sort" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Reading status" })).toBeTruthy();
  });

  it("reveals the filter panel when the trigger is pressed", async () => {
    const user = userEvent.setup();
    renderSheet();

    // Closed sheets render nothing — this is what makes it safe to mount the
    // same LibraryFilters in both the desktop rail and the mobile sheet.
    expect(screen.queryByTestId("library-filters")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByTestId("library-filters")).toBeTruthy();
  });
});
