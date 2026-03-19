// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataTableColumnHeader } from "./data-table-column-header";

describe("DataTableColumnHeader", () => {
  it("renders a div with title when column cannot sort", () => {
    const column = {
      getCanSort: () => false,
      getIsSorted: () => false as const,
      toggleSorting: vi.fn(),
    };
    const { container } = render(
      <DataTableColumnHeader column={column as any} title="Name" />
    );
    expect(screen.getByText("Name")).toBeTruthy();
    // Should be a div, not a button
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders a button with ChevronsUpDown when column can sort but is not sorted", () => {
    const column = {
      getCanSort: () => true,
      getIsSorted: () => false as const,
      toggleSorting: vi.fn(),
    };
    const { container } = render(
      <DataTableColumnHeader column={column as any} title="Name" />
    );
    expect(container.querySelector("button")).toBeTruthy();
    // ChevronsUpDown icon renders as svg
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
  });

  it("renders ArrowDown icon when sorted desc", () => {
    const column = {
      getCanSort: () => true,
      getIsSorted: () => "desc" as const,
      toggleSorting: vi.fn(),
    };
    const { container } = render(
      <DataTableColumnHeader column={column as any} title="Name" />
    );
    expect(container.querySelector("button")).toBeTruthy();
    // ArrowDown icon renders as svg
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders ArrowUp icon when sorted asc", () => {
    const column = {
      getCanSort: () => true,
      getIsSorted: () => "asc" as const,
      toggleSorting: vi.fn(),
    };
    const { container } = render(
      <DataTableColumnHeader column={column as any} title="Name" />
    );
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("clicking button calls toggleSorting", () => {
    const toggleSorting = vi.fn();
    const column = {
      getCanSort: () => true,
      getIsSorted: () => "asc" as const,
      toggleSorting,
    };
    const { container } = render(
      <DataTableColumnHeader column={column as any} title="Name" />
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    // toggleSorting called with true because sorted === "asc"
    expect(toggleSorting).toHaveBeenCalledWith(true);
  });

  it("clicking button calls toggleSorting with false when not sorted asc", () => {
    const toggleSorting = vi.fn();
    const column = {
      getCanSort: () => true,
      getIsSorted: () => false as const,
      toggleSorting,
    };
    const { container } = render(
      <DataTableColumnHeader column={column as any} title="Name" />
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(toggleSorting).toHaveBeenCalledWith(false);
  });
});
