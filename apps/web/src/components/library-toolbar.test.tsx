// @vitest-environment happy-dom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LibraryToolbar, type SortValue } from "./library-toolbar";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import type { LibraryView } from "~/hooks/use-library-view-preference";
import type { GridTileSize } from "~/hooks/use-grid-tile-size";

const defaultProps = {
  searchValue: "",
  onSearchChange: vi.fn(),
  sortValue: "title-asc" as SortValue,
  onSortChange: vi.fn(),
  view: "grid" as LibraryView,
  onViewChange: vi.fn(),
  filterValue: "all" as ReadingFilter,
  onFilterChange: vi.fn(),
  tileSize: "small" as GridTileSize,
  onTileSizeChange: vi.fn(),
};

describe("LibraryToolbar", () => {
  it("renders search input with placeholder", () => {
    render(<LibraryToolbar {...defaultProps} />);
    expect(screen.getByPlaceholderText("Filter by title or author...")).toBeTruthy();
  });

  it("calls onSearchChange after debounce when typing in search input", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} onSearchChange={onSearchChange} />);
    await user.type(screen.getByPlaceholderText("Filter by title or author..."), "hello");
    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith("hello");
    });
  });

  it("shows clear button when searchValue is non-empty", () => {
    render(<LibraryToolbar {...defaultProps} searchValue="test" />);
    expect(screen.getByLabelText("Clear search")).toBeTruthy();
  });

  it("does not show clear button when searchValue is empty", () => {
    render(<LibraryToolbar {...defaultProps} searchValue="" />);
    expect(screen.queryByLabelText("Clear search")).toBeNull();
  });

  it("calls onSearchChange with empty string when clear is clicked", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} searchValue="test" onSearchChange={onSearchChange} />);
    await user.click(screen.getByLabelText("Clear search"));
    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith("");
    });
  });

  it("renders sort and filter select triggers", () => {
    render(<LibraryToolbar {...defaultProps} />);
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(2);
  });

  it("calls onSortChange when a sort option is selected", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} onSortChange={onSortChange} />);
    const comboboxes = screen.getAllByRole("combobox");
    // Sort select is the second combobox (after filter)
    const sortCombobox = comboboxes.at(1);
    expect(sortCombobox).toBeTruthy();
    await user.click(sortCombobox as HTMLElement);
    await user.click(screen.getByText("Title Z-A"));
    expect(onSortChange).toHaveBeenCalledWith("title-desc");
  });

  it("renders grid and table toggle buttons", () => {
    render(<LibraryToolbar {...defaultProps} />);
    expect(screen.getByLabelText("Grid view")).toBeTruthy();
    expect(screen.getByLabelText("Table view")).toBeTruthy();
  });

  it("calls onViewChange when table toggle is clicked", async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} view="grid" onViewChange={onViewChange} />);
    await user.click(screen.getByLabelText("Table view"));
    expect(onViewChange).toHaveBeenCalledWith("table");
  });

  it("calls onViewChange when grid toggle is clicked", async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} view="table" onViewChange={onViewChange} />);
    await user.click(screen.getByLabelText("Grid view"));
    expect(onViewChange).toHaveBeenCalledWith("grid");
  });

  it("applies default variant to active grid button", () => {
    render(<LibraryToolbar {...defaultProps} view="grid" />);
    const gridBtn = screen.getByLabelText("Grid view");
    const tableBtn = screen.getByLabelText("Table view");
    expect(gridBtn.getAttribute("data-active")).toBe("true");
    expect(tableBtn.getAttribute("data-active")).toBe("false");
  });

  it("applies default variant to active table button", () => {
    render(<LibraryToolbar {...defaultProps} view="table" />);
    const gridBtn = screen.getByLabelText("Grid view");
    const tableBtn = screen.getByLabelText("Table view");
    expect(gridBtn.getAttribute("data-active")).toBe("false");
    expect(tableBtn.getAttribute("data-active")).toBe("true");
  });

  it("renders filter select with 'All' as default", () => {
    render(<LibraryToolbar {...defaultProps} filterValue="all" />);
    const comboboxes = screen.getAllByRole("combobox");
    // There should be two comboboxes: sort + filter
    expect(comboboxes).toHaveLength(2);
  });

  it("calls onFilterChange when a filter option is selected", async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} onFilterChange={onFilterChange} />);
    const comboboxes = screen.getAllByRole("combobox");
    // Filter select is the first combobox
    const filterCombobox = comboboxes.at(0);
    expect(filterCombobox).toBeTruthy();
    await user.click(filterCombobox as HTMLElement);
    await user.click(screen.getByText("Currently Reading"));
    expect(onFilterChange).toHaveBeenCalledWith("reading");
  });

  it("renders tile size toggle buttons when view is grid", () => {
    render(<LibraryToolbar {...defaultProps} view="grid" />);
    expect(screen.getByLabelText("Small tiles")).toBeTruthy();
    expect(screen.getByLabelText("Large tiles")).toBeTruthy();
  });

  it("does not render tile size toggle when view is table", () => {
    render(<LibraryToolbar {...defaultProps} view="table" />);
    expect(screen.queryByLabelText("Small tiles")).toBeNull();
    expect(screen.queryByLabelText("Large tiles")).toBeNull();
  });

  it("calls onTileSizeChange when large tile toggle is clicked", async () => {
    const onTileSizeChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} tileSize="small" onTileSizeChange={onTileSizeChange} />);
    await user.click(screen.getByLabelText("Large tiles"));
    expect(onTileSizeChange).toHaveBeenCalledWith("large");
  });

  it("calls onTileSizeChange when small tile toggle is clicked", async () => {
    const onTileSizeChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} tileSize="large" onTileSizeChange={onTileSizeChange} />);
    await user.click(screen.getByLabelText("Small tiles"));
    expect(onTileSizeChange).toHaveBeenCalledWith("small");
  });

  it("applies active state to small tile button when tileSize is small", () => {
    render(<LibraryToolbar {...defaultProps} tileSize="small" />);
    expect(screen.getByLabelText("Small tiles").getAttribute("data-active")).toBe("true");
    expect(screen.getByLabelText("Large tiles").getAttribute("data-active")).toBe("false");
  });

  it("applies active state to large tile button when tileSize is large", () => {
    render(<LibraryToolbar {...defaultProps} tileSize="large" />);
    expect(screen.getByLabelText("Small tiles").getAttribute("data-active")).toBe("false");
    expect(screen.getByLabelText("Large tiles").getAttribute("data-active")).toBe("true");
  });

  it("does not render tile size toggle when props are not provided", () => {
    const { tileSize: _ts, onTileSizeChange: _otsc, ...propsWithoutTileSize } = defaultProps;
    render(<LibraryToolbar {...propsWithoutTileSize} view="grid" />);
    expect(screen.queryByLabelText("Small tiles")).toBeNull();
    expect(screen.queryByLabelText("Large tiles")).toBeNull();
  });

});

it("renders the leading slot inside the control row", () => {
  const { container } = render(
    <LibraryToolbar {...defaultProps} leading={<button type="button">Filters</button>} />,
  );
  // The filters trigger shares the search row rather than sitting above it.
  // Whether that actually saves vertical space is measured in the browser
  // suite - happy-dom does no layout, so a class assertion here would pass
  // against any arrangement at all.
  const row = container.firstElementChild;
  const trigger = screen.getByRole("button", { name: "Filters" });
  expect(row?.contains(trigger)).toBe(true);
});

it("keeps status and sort in the row unless a sheet is showing them", () => {
  const { rerender } = render(<LibraryToolbar {...defaultProps} />);
  // Shelf detail has no filters sheet: hiding these below lg would strand
  // them with no other way to reach reading status or sort.
  const inRow = screen.getAllByRole("combobox");
  expect(inRow.length).toBeGreaterThanOrEqual(2);
  inRow.forEach((el) => {
    expect(el.closest(".hidden")).toBeNull();
  });

  rerender(<LibraryToolbar {...defaultProps} filtersInSheet />);
  screen.getAllByRole("combobox").forEach((el) => {
    expect(el.closest("div")?.className).toContain("lg:block");
  });
});

it("offers a list view toggle", () => {
  const onViewChange = vi.fn();
  render(<LibraryToolbar {...defaultProps} view="grid" onViewChange={onViewChange} />);
  const listToggle = screen.getByLabelText("List view");
  expect(listToggle.getAttribute("data-active")).toBe("false");
  fireEvent.click(listToggle);
  expect(onViewChange).toHaveBeenCalledWith("list");
});

it("marks the list toggle active in list view", () => {
  render(<LibraryToolbar {...defaultProps} view="list" />);
  expect(screen.getByLabelText("List view").getAttribute("data-active")).toBe("true");
});

it("offers a select toggle in grid view", () => {
  const onSelectModeChange = vi.fn();
  render(
    <LibraryToolbar {...defaultProps} view="grid" onSelectModeChange={onSelectModeChange} />,
  );
  const toggle = screen.getByRole("button", { name: "Select works" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(toggle);
  expect(onSelectModeChange).toHaveBeenCalledWith(true);
});

it("reflects active select mode", () => {
  render(<LibraryToolbar {...defaultProps} view="grid" selectMode onSelectModeChange={vi.fn()} />);
  expect(
    screen.getByRole("button", { name: "Select works" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("hides the select toggle in table view, which has its own checkboxes", () => {
  render(<LibraryToolbar {...defaultProps} view="table" onSelectModeChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Select works" })).toBeNull();
});

it("hides the select toggle when no handler is supplied", () => {
  render(<LibraryToolbar {...defaultProps} view="grid" />);
  expect(screen.queryByRole("button", { name: "Select works" })).toBeNull();
});

it("does not fire onSearchChange on mount", () => {
  const onSearchChange = vi.fn();
  render(<LibraryToolbar {...defaultProps} searchValue="existing" onSearchChange={onSearchChange} />);
  // updateSearch resets page to 1, so firing here snapped any link to page 2+
  // back to page 1 before the user saw it.
  expect(onSearchChange).not.toHaveBeenCalled();
});

it("still fires onSearchChange when the search is cleared", async () => {
  const onSearchChange = vi.fn();
  render(<LibraryToolbar {...defaultProps} searchValue="existing" onSearchChange={onSearchChange} />);
  const input = screen.getByPlaceholderText("Filter by title or author...");
  fireEvent.change(input, { target: { value: "" } });
  await waitFor(() => {
    expect(onSearchChange).toHaveBeenCalledWith("");
  });
});
