// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LibraryPagination } from "./library-pagination";

function renderPagination(props: Partial<Parameters<typeof LibraryPagination>[0]> = {}) {
  const defaultProps = {
    page: 1,
    pageSize: 50,
    totalCount: 120,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  };
  return render(<LibraryPagination {...defaultProps} {...props} />);
}

describe("LibraryPagination", () => {
  it("renders total count", () => {
    renderPagination({ totalCount: 120 });
    expect(screen.getByText("120 row(s) total")).toBeTruthy();
  });

  it("renders page info text", () => {
    renderPagination({ page: 1, pageSize: 50, totalCount: 120 });
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
  });

  it("renders rows per page selector", () => {
    renderPagination();
    expect(screen.getByText("Rows per page")).toBeTruthy();
  });

  it("renders navigation buttons", () => {
    renderPagination({ page: 2, totalCount: 120 });
    expect(screen.getByLabelText("Go to first page")).toBeTruthy();
    expect(screen.getByLabelText("Go to previous page")).toBeTruthy();
    expect(screen.getByLabelText("Go to next page")).toBeTruthy();
    expect(screen.getByLabelText("Go to last page")).toBeTruthy();
  });

  it("disables previous and first buttons on first page", () => {
    renderPagination({ page: 1, totalCount: 120 });
    expect(screen.getByLabelText("Go to first page").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Go to previous page").hasAttribute("disabled")).toBe(true);
  });

  it("disables next and last buttons on last page", () => {
    renderPagination({ page: 3, pageSize: 50, totalCount: 120 });
    expect(screen.getByLabelText("Go to next page").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Go to last page").hasAttribute("disabled")).toBe(true);
  });

  it("calls onPageChange with page - 1 when previous is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    renderPagination({ page: 2, totalCount: 120, onPageChange });
    await user.click(screen.getByLabelText("Go to previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with page + 1 when next is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    renderPagination({ page: 1, totalCount: 120, onPageChange });
    await user.click(screen.getByLabelText("Go to next page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with 1 when first page button is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    renderPagination({ page: 2, totalCount: 120, onPageChange });
    await user.click(screen.getByLabelText("Go to first page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with last page when last page button is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    renderPagination({ page: 1, pageSize: 50, totalCount: 120, onPageChange });
    await user.click(screen.getByLabelText("Go to last page"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("calculates total pages correctly with exact division", () => {
    renderPagination({ page: 1, pageSize: 50, totalCount: 100 });
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });

  it("calculates total pages correctly with remainder", () => {
    renderPagination({ page: 1, pageSize: 50, totalCount: 51 });
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });

  it("shows Page 1 of 1 when totalCount is 0", () => {
    renderPagination({ totalCount: 0 });
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.getByText("0 row(s) total")).toBeTruthy();
  });

  it("shows Page 1 of 1 when totalCount fits one page", () => {
    renderPagination({ totalCount: 49, pageSize: 50 });
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("calls onPageSizeChange when rows per page is changed", async () => {
    const onPageSizeChange = vi.fn();
    const user = userEvent.setup();
    renderPagination({ onPageSizeChange });

    // Open the select dropdown and pick a different page size
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "20" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });
});
