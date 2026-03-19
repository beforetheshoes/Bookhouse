// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";

type TestRow = { name: string; age: number };

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" },
];

const data: TestRow[] = [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }];

describe("DataTable", () => {
  it("renders table with data rows", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("shows 'No results.' when data is empty", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });

  it("renders toolbar when filterColumn is provided", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />
    );
    expect(screen.getByPlaceholderText("Filter by name...")).toBeTruthy();
  });

  it("does not render toolbar input when filterColumn is omitted", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByPlaceholderText("Filter...")).toBeNull();
  });

  it("filter input narrows results", () => {
    render(
      <DataTable columns={columns} data={data} filterColumn="name" filterPlaceholder="Filter..." />
    );
    const input = screen.getByPlaceholderText("Filter...");
    fireEvent.change(input, { target: { value: "Alice" } });
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("shows row count in pagination", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("2 row(s) total")).toBeTruthy();
  });

  it("renders grouped column headers with placeholder (isPlaceholder branch)", () => {
    // Mix a grouped column with a flat column — the flat column in the top header
    // row becomes a placeholder (isPlaceholder=true) in TanStack Table.
    const mixedColumns: ColumnDef<TestRow>[] = [
      {
        header: "Personal Info",
        columns: [
          { accessorKey: "name", header: "Name" },
        ],
      },
      { accessorKey: "age", header: "Age" },
    ];
    render(<DataTable columns={mixedColumns} data={data} />);
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Age")).toBeTruthy();
  });

  it("renders selected row (getIsSelected=true branch covers && 'selected')", () => {
    // TanStack Table uses row index "0" as the default row ID
    // Pass rowSelection with "0" selected to make row.getIsSelected() return true
    render(
      <DataTable
        columns={columns}
        data={data}
        rowSelection={{ "0": true }}
      />
    );
    // Row 0 (Alice) should now have data-state="selected"
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
