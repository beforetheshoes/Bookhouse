// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DataTablePagination } from "./data-table-pagination";

function makeMockTable(overrides: Record<string, any> = {}) {
  const setPageSize = vi.fn();
  const previousPage = vi.fn();
  const nextPage = vi.fn();
  const setPageIndex = vi.fn();

  const table = {
    getFilteredRowModel: () => ({ rows: [1, 2, 3] }),
    getState: () => ({ pagination: { pageSize: 20, pageIndex: 0 } }),
    getPageCount: () => 2,
    getCanPreviousPage: () => false,
    getCanNextPage: () => true,
    setPageSize,
    previousPage,
    nextPage,
    setPageIndex,
    ...overrides,
  };

  return { table, setPageSize, previousPage, nextPage, setPageIndex };
}

describe("DataTablePagination", () => {
  it("shows row count", () => {
    const { table } = makeMockTable();
    render(<DataTablePagination table={table as any} />);
    expect(screen.getByText("3 row(s) total")).toBeTruthy();
  });

  it("shows current page and total pages", () => {
    const { table } = makeMockTable();
    render(<DataTablePagination table={table as any} />);
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });

  it("next page button is enabled when canNextPage=true", () => {
    const { table } = makeMockTable({ getCanNextPage: () => true });
    const { container } = render(<DataTablePagination table={table as any} />);
    // "Go to next page" button
    const buttons = container.querySelectorAll("button");
    const nextBtn = Array.from(buttons).find(
      (b) => b.querySelector(".sr-only")?.textContent === "Go to next page"
    );
    expect(nextBtn).toBeTruthy();
    expect(nextBtn!.disabled).toBe(false);
  });

  it("previous page button is disabled when canPreviousPage=false", () => {
    const { table } = makeMockTable({ getCanPreviousPage: () => false });
    const { container } = render(<DataTablePagination table={table as any} />);
    const buttons = container.querySelectorAll("button");
    const prevBtn = Array.from(buttons).find(
      (b) => b.querySelector(".sr-only")?.textContent === "Go to previous page"
    );
    expect(prevBtn).toBeTruthy();
    expect(prevBtn!.disabled).toBe(true);
  });

  it("clicking next page calls table.nextPage()", () => {
    const { table, nextPage } = makeMockTable();
    const { container } = render(<DataTablePagination table={table as any} />);
    const buttons = container.querySelectorAll("button");
    const nextBtn = Array.from(buttons).find(
      (b) => b.querySelector(".sr-only")?.textContent === "Go to next page"
    )!;
    fireEvent.click(nextBtn);
    expect(nextPage).toHaveBeenCalled();
  });

  it("clicking first page sets index to 0", () => {
    const { table, setPageIndex } = makeMockTable({ getCanPreviousPage: () => true });
    const { container } = render(<DataTablePagination table={table as any} />);
    const buttons = container.querySelectorAll("button");
    const firstBtn = Array.from(buttons).find(
      (b) => b.querySelector(".sr-only")?.textContent === "Go to first page"
    )!;
    fireEvent.click(firstBtn);
    expect(setPageIndex).toHaveBeenCalledWith(0);
  });

  it("clicking last page calls setPageIndex with pageCount-1", () => {
    const { table, setPageIndex } = makeMockTable({ getCanNextPage: () => true, getPageCount: () => 5 });
    const { container } = render(<DataTablePagination table={table as any} />);
    const buttons = container.querySelectorAll("button");
    const lastBtn = Array.from(buttons).find(
      (b) => b.querySelector(".sr-only")?.textContent === "Go to last page"
    )!;
    fireEvent.click(lastBtn);
    expect(setPageIndex).toHaveBeenCalledWith(4);
  });

  it("clicking previous page calls table.previousPage()", () => {
    const { table, previousPage } = makeMockTable({ getCanPreviousPage: () => true });
    const { container } = render(<DataTablePagination table={table as any} />);
    const buttons = container.querySelectorAll("button");
    const prevBtn = Array.from(buttons).find(
      (b) => b.querySelector(".sr-only")?.textContent === "Go to previous page"
    )!;
    fireEvent.click(prevBtn);
    expect(previousPage).toHaveBeenCalled();
  });

  it("changing page size select calls table.setPageSize", async () => {
    const user = userEvent.setup();
    const { table, setPageSize } = makeMockTable();
    render(<DataTablePagination table={table as any} />);
    // Open the Radix UI Select by clicking the trigger
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    // Click the "10" option
    const option = await screen.findByText("10");
    await user.click(option);
    expect(setPageSize).toHaveBeenCalledWith(10);
  });
});
