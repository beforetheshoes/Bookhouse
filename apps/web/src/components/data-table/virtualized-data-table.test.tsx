// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualizedDataTable } from "./virtualized-data-table";

const { useVirtualizerMock } = vi.hoisted(() => ({
  useVirtualizerMock: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: useVirtualizerMock,
}));

// Default virtualizer mock: top spacer (start > 0), bottom spacer (end < totalSize)
function makeVirtualizer(count: number, opts?: { start?: number; end?: number; totalSize?: number }) {
  const start = opts?.start ?? (count > 0 ? 48 : 0);
  const end = opts?.end ?? (count > 0 ? 96 : 0);
  const totalSize = opts?.totalSize ?? (count * 48 * 3);
  return {
    getVirtualItems: () =>
      count > 0
        ? [{ index: 0, start, end }]
        : [],
    getTotalSize: () => totalSize,
  };
}

type TestRow = { name: string };

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: "name", header: "Name" },
];

const data: TestRow[] = [
  { name: "Alice" },
  { name: "Bob" },
  { name: "Charlie" },
  { name: "Dave" },
];

describe("VirtualizedDataTable", () => {
  it("renders data rows (virtualized) with top and bottom spacers", () => {
    // start=48 > 0 → top spacer rendered
    // end=96 < totalSize (4*48*3=576) → bottom spacer rendered
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(<VirtualizedDataTable columns={columns} data={data} />);
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("renders data rows without bottom spacer when end >= totalSize", () => {
    // end >= totalSize → no bottom spacer (covers lastItem.end < totalSize = false branch)
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count, { start: 48, end: 96, totalSize: 96 });
    });
    render(<VirtualizedDataTable columns={columns} data={data} />);
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("shows 'No results.' when data is empty", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(<VirtualizedDataTable columns={columns} data={[]} />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });

  it("renders toolbar when filterColumn is provided", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(
      <VirtualizedDataTable
        columns={columns}
        data={data}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />
    );
    expect(screen.getByPlaceholderText("Filter by name...")).toBeTruthy();
  });

  it("renders pagination", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(<VirtualizedDataTable columns={columns} data={data} />);
    expect(screen.getByText(/row\(s\) total/)).toBeTruthy();
  });

  it("hides built-in pagination when showPagination is false", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(<VirtualizedDataTable columns={columns} data={data} showPagination={false} />);
    expect(screen.queryByText(/row\(s\) total/)).toBeNull();
  });

  it("renders with custom pageSize and containerHeight", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    const { container } = render(
      <VirtualizedDataTable
        columns={columns}
        data={data}
        pageSize={10}
        containerHeight="400px"
      />
    );
    const scrollDiv = container.querySelector("[style]");
    expect(scrollDiv).toBeTruthy();
    expect((scrollDiv as HTMLElement).style.maxHeight).toBe("400px");
  });

  it("renders grouped column headers with placeholder (isPlaceholder branch)", () => {
    // Mix a grouped column with a flat column — the flat column in the top header row
    // becomes a placeholder (isPlaceholder=true) in TanStack Table.
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    type TestRow2 = { name: string; age: number };
    const mixedColumns: ColumnDef<TestRow2>[] = [
      {
        header: "Personal Info",
        columns: [
          { accessorKey: "name", header: "Name" },
        ],
      },
      { accessorKey: "age", header: "Age" },
    ];
    const mixedData: TestRow2[] = [{ name: "Alice", age: 30 }];
    render(<VirtualizedDataTable columns={mixedColumns} data={mixedData} />);
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Age")).toBeTruthy();
  });

  it("skips out-of-bounds virtual rows (null return branch)", () => {
    // Virtualizer reports a row at index 999 which is outside the actual rows array.
    // The component should render without crashing (the null branch is hit and skipped).
    useVirtualizerMock.mockImplementation(({ getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return {
        getVirtualItems: () => [{ index: 999, start: 0, end: 48 }],
        getTotalSize: () => 48,
      };
    });
    const { container } = render(<VirtualizedDataTable columns={columns} data={data} />);
    expect(container).toBeTruthy();
  });

  it("hides a column when columnVisibility marks it false", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    const multiColumns: ColumnDef<{ name: string; age: string }>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "age", header: "Age" },
    ];
    render(
      <VirtualizedDataTable
        columns={multiColumns}
        data={[{ name: "Alice", age: "30" }]}
        columnVisibility={{ age: false }}
      />
    );
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.queryByText("Age")).toBeNull();
    expect(screen.queryByText("30")).toBeNull();
  });

  it("applies whitespace-normal class when textOverflow is 'wrap'", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(
      <VirtualizedDataTable
        columns={columns}
        data={data}
        textOverflow="wrap"
      />
    );
    const cell = screen.getByText("Alice").closest("td");
    expect(cell?.className).toContain("whitespace-normal");
    expect(cell?.className).toContain("break-words");
  });

  it("applies overflow-hidden and text-ellipsis when textOverflow is 'truncate'", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(
      <VirtualizedDataTable
        columns={columns}
        data={data}
        textOverflow="truncate"
      />
    );
    const cell = screen.getByText("Alice").closest("td");
    expect(cell?.className).toContain("overflow-hidden");
    expect(cell?.className).toContain("text-ellipsis");
  });

  it("defaults textOverflow to 'truncate' (no explicit prop)", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(<VirtualizedDataTable columns={columns} data={data} />);
    const cell = screen.getByText("Alice").closest("td");
    expect(cell?.className).toContain("overflow-hidden");
    expect(cell?.className).toContain("text-ellipsis");
  });

  it("applies table-fixed class to the table element", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    const { container } = render(<VirtualizedDataTable columns={columns} data={data} />);
    const table = container.querySelector("table");
    expect(table?.className).toContain("table-fixed");
  });

  it("applies column width style from column size definition", () => {
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    const sizedColumns: ColumnDef<TestRow>[] = [
      { accessorKey: "name", header: "Name", size: 200 },
    ];
    render(<VirtualizedDataTable columns={sizedColumns} data={data} />);
    const th = screen.getByText("Name").closest("th");
    expect(th?.style.width).toBe("200px");
  });

  it("renders selected row (getIsSelected=true branch covers && 'selected')", () => {
    // TanStack Table uses row index "0" as the default row ID
    useVirtualizerMock.mockImplementation(({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => HTMLElement | null; estimateSize: () => number }) => {
      getScrollElement();
      estimateSize();
      return makeVirtualizer(count);
    });
    render(
      <VirtualizedDataTable
        columns={columns}
        data={data}
        rowSelection={{ "0": true }}
      />
    );
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
