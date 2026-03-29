// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
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
