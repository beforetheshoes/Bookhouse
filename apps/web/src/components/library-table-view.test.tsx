// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/components/data-table", () => ({
  VirtualizedDataTable: (props: { columnVisibility?: Record<string, boolean>; textOverflow?: string; [k: string]: string | boolean | Record<string, boolean> | undefined }) => (
    <div data-testid="virtualized-data-table" data-column-visibility={JSON.stringify(props.columnVisibility)} data-text-overflow={String(props.textOverflow)} />
  ),
}));

vi.mock("~/components/data-table/data-table-column-picker", () => ({
  DataTableColumnPicker: (props: { columnVisibility?: Record<string, boolean>; [k: string]: string | boolean | Record<string, boolean> | undefined }) => (
    <div data-testid="column-picker" data-column-visibility={JSON.stringify(props.columnVisibility)} />
  ),
}));

import { LibraryTableView } from "./library-table-view";

const defaultProps = {
  works: [],
  columns: [],
  editMode: false,
  onEditModeToggle: vi.fn(),
  tablePrefs: { columnVisibility: {} as Record<string, boolean>, textOverflow: "truncate" as const },
  onColumnToggle: vi.fn(),
  onTextOverflowToggle: vi.fn(),
  rowSelection: {},
  onRowSelectionChange: vi.fn(),
  sorting: [],
  onSortingChange: vi.fn(),
};

describe("LibraryTableView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders edit mode toggle button with 'Edit' label", () => {
    render(<LibraryTableView {...defaultProps} />);
    expect(screen.getByTestId("edit-mode-toggle")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("shows 'Done' label when editMode is true", () => {
    render(<LibraryTableView {...defaultProps} editMode={true} />);
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("calls onEditModeToggle when edit button is clicked", () => {
    const onEditModeToggle = vi.fn();
    render(<LibraryTableView {...defaultProps} onEditModeToggle={onEditModeToggle} />);
    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    expect(onEditModeToggle).toHaveBeenCalled();
  });

  it("renders Wrap button when textOverflow is truncate", () => {
    render(<LibraryTableView {...defaultProps} />);
    expect(screen.getByRole("button", { name: /wrap text/i })).toBeTruthy();
  });

  it("renders Truncate button when textOverflow is wrap", () => {
    render(<LibraryTableView {...defaultProps} tablePrefs={{ ...defaultProps.tablePrefs, textOverflow: "wrap" }} />);
    expect(screen.getByRole("button", { name: /truncate text/i })).toBeTruthy();
  });

  it("calls onTextOverflowToggle when text overflow button is clicked", () => {
    const onTextOverflowToggle = vi.fn();
    render(<LibraryTableView {...defaultProps} onTextOverflowToggle={onTextOverflowToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /wrap text/i }));
    expect(onTextOverflowToggle).toHaveBeenCalled();
  });

  it("renders column picker", () => {
    render(<LibraryTableView {...defaultProps} />);
    expect(screen.getByTestId("column-picker")).toBeTruthy();
  });

  it("renders VirtualizedDataTable", () => {
    render(<LibraryTableView {...defaultProps} />);
    expect(screen.getByTestId("virtualized-data-table")).toBeTruthy();
  });

  it("passes columnVisibility and textOverflow to VirtualizedDataTable", () => {
    const prefs = { columnVisibility: { isbn: false }, textOverflow: "wrap" as const };
    render(<LibraryTableView {...defaultProps} tablePrefs={prefs} />);
    const table = screen.getByTestId("virtualized-data-table");
    expect(table.getAttribute("data-column-visibility")).toBe(JSON.stringify({ isbn: false }));
    expect(table.getAttribute("data-text-overflow")).toBe("wrap");
  });
});
