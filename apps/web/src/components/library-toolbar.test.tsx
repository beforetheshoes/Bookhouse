// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LibraryToolbar } from "./library-toolbar";
import type { SortOption } from "~/lib/sort-filter-works";
import type { LibraryView } from "~/hooks/use-library-view-preference";

const defaultProps = {
  searchValue: "",
  onSearchChange: vi.fn(),
  sortValue: "title-asc" as SortOption,
  onSortChange: vi.fn(),
  view: "grid" as LibraryView,
  onViewChange: vi.fn(),
};

describe("LibraryToolbar", () => {
  it("renders search input with placeholder", () => {
    render(<LibraryToolbar {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search title or author...")).toBeTruthy();
  });

  it("calls onSearchChange when typing in search input", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} onSearchChange={onSearchChange} />);
    await user.type(screen.getByPlaceholderText("Search title or author..."), "hello");
    expect(onSearchChange).toHaveBeenCalled();
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
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("renders sort select trigger", () => {
    render(<LibraryToolbar {...defaultProps} />);
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("calls onSortChange when a sort option is selected", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    render(<LibraryToolbar {...defaultProps} onSortChange={onSortChange} />);
    await user.click(screen.getByRole("combobox"));
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
});
