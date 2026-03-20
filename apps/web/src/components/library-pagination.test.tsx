// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LibraryPagination } from "./library-pagination";

describe("LibraryPagination", () => {
  it("renders nothing when totalCount is 0", () => {
    const { container } = render(
      <LibraryPagination page={1} pageSize={50} totalCount={0} onPageChange={vi.fn()} />,
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders nothing when only one page", () => {
    const { container } = render(
      <LibraryPagination page={1} pageSize={50} totalCount={49} onPageChange={vi.fn()} />,
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders page info text", () => {
    render(
      <LibraryPagination page={1} pageSize={50} totalCount={120} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
  });

  it("renders previous and next buttons", () => {
    render(
      <LibraryPagination page={2} pageSize={50} totalCount={120} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Previous page")).toBeTruthy();
    expect(screen.getByLabelText("Next page")).toBeTruthy();
  });

  it("disables previous button on first page", () => {
    render(
      <LibraryPagination page={1} pageSize={50} totalCount={120} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Previous page").hasAttribute("disabled")).toBe(true);
  });

  it("disables next button on last page", () => {
    render(
      <LibraryPagination page={3} pageSize={50} totalCount={120} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Next page").hasAttribute("disabled")).toBe(true);
  });

  it("calls onPageChange with page - 1 when previous is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryPagination page={2} pageSize={50} totalCount={120} onPageChange={onPageChange} />,
    );
    await user.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with page + 1 when next is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryPagination page={1} pageSize={50} totalCount={120} onPageChange={onPageChange} />,
    );
    await user.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calculates total pages correctly with exact division", () => {
    render(
      <LibraryPagination page={1} pageSize={50} totalCount={100} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });

  it("calculates total pages correctly with remainder", () => {
    render(
      <LibraryPagination page={1} pageSize={50} totalCount={51} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });
});
