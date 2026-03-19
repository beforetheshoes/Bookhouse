// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataTableToolbar } from "./data-table-toolbar";

function makeMockTable(columnFilters: any[] = []) {
  const setFilterValue = vi.fn();
  const resetColumnFilters = vi.fn();
  return {
    table: {
      getColumn: vi.fn((_id: string) => ({
        getFilterValue: vi.fn(() => ""),
        setFilterValue,
      })),
      getState: () => ({ columnFilters }),
      resetColumnFilters,
    },
    setFilterValue,
    resetColumnFilters,
  };
}

describe("DataTableToolbar", () => {
  it("returns null when no filterColumn prop", () => {
    const { table } = makeMockTable();
    const { container } = render(
      <DataTableToolbar table={table as any} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders input when filterColumn is provided", () => {
    const { table } = makeMockTable();
    render(
      <DataTableToolbar table={table as any} filterColumn="name" filterPlaceholder="Filter..." />
    );
    expect(screen.getByPlaceholderText("Filter...")).toBeTruthy();
  });

  it("shows reset button when filters are active", () => {
    const { table } = makeMockTable([{ id: "name", value: "Alice" }]);
    render(
      <DataTableToolbar table={table as any} filterColumn="name" />
    );
    expect(screen.getByText("Reset")).toBeTruthy();
  });

  it("hides reset button when no filters are active", () => {
    const { table } = makeMockTable([]);
    render(
      <DataTableToolbar table={table as any} filterColumn="name" />
    );
    expect(screen.queryByText("Reset")).toBeNull();
  });

  it("input change calls setFilterValue", () => {
    const { table, setFilterValue } = makeMockTable();
    render(
      <DataTableToolbar table={table as any} filterColumn="name" filterPlaceholder="Filter..." />
    );
    const input = screen.getByPlaceholderText("Filter...");
    fireEvent.change(input, { target: { value: "Alice" } });
    expect(setFilterValue).toHaveBeenCalledWith("Alice");
  });

  it("reset button calls resetColumnFilters", () => {
    const { table, resetColumnFilters } = makeMockTable([{ id: "name", value: "test" }]);
    render(
      <DataTableToolbar table={table as any} filterColumn="name" />
    );
    const resetBtn = screen.getByText("Reset");
    fireEvent.click(resetBtn);
    expect(resetColumnFilters).toHaveBeenCalled();
  });

  it("uses default placeholder 'Filter...' when filterPlaceholder not provided", () => {
    const { table } = makeMockTable();
    render(
      <DataTableToolbar table={table as any} filterColumn="name" />
    );
    expect(screen.getByPlaceholderText("Filter...")).toBeTruthy();
  });
});
