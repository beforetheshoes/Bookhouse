// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import type * as DataTableModule from "~/components/data-table";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEdition = {
  id: "e1",
  formatFamily: "EBOOK",
  publisher: "Penguin",
  isbn13: "978-1",
  isbn10: null,
  asin: null,
  language: "en",
  pageCount: null,
  editedFields: [],
  publishedAt: null,
  contributors: [{ role: "AUTHOR", contributor: { id: "c1", nameDisplay: "George Orwell" } }],
  editionFiles: [{ id: "ef-1", role: "PRIMARY", fileAsset: { id: "fa-1", basename: "1984.epub", sizeBytes: 1024n, mediaKind: "EPUB", availabilityStatus: "PRESENT" } }],
  work: {
    id: "w1",
    titleDisplay: "1984",
    titleCanonical: "1984",
    sortTitle: "1984",
    coverPath: "w1",
    coverColors: null,
    createdAt: new Date(),
    enrichmentStatus: "ENRICHED",
    description: null,
    seriesPosition: null,
    series: null,
    editedFields: [],
  },
};

let mockLoaderData: {
  shelf: {
    id: string;
    name: string;
    formatFilter: string;
    items: { id: string; edition: typeof mockEdition }[];
  };
} = {
  shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [] },
};

let mockView = "grid";
let mockTileSize = "small";

const getShelfDetailServerFnMock = vi.fn();
const getAvailableEditionsServerFnMock = vi.fn().mockResolvedValue([]);
const addEditionToShelfServerFnMock = vi.fn().mockResolvedValue({});

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const removeEditionFromShelfServerFnMock = vi.fn().mockResolvedValue({});

vi.mock("~/lib/server-fns/shelves", () => ({
  getShelfDetailServerFn: getShelfDetailServerFnMock,
  removeEditionFromShelfServerFn: removeEditionFromShelfServerFnMock,
  getAvailableEditionsServerFn: getAvailableEditionsServerFnMock,
  addEditionToShelfServerFn: addEditionToShelfServerFnMock,
}));

vi.mock("~/components/library-grid", () => ({
  LibraryGrid: ({ works, tileSize }: { works: object[]; tileSize?: string }) => (
    <div data-testid="library-grid" data-tile-size={tileSize ?? "small"}>Grid: {String(works.length)} works</div>
  ),
}));

let capturedOnRowSelectionChange: ((sel: Record<string, boolean>) => void) | null = null;

vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return {
    ...actual,
    VirtualizedDataTable: ({ data, onRowSelectionChange }: { data: { id: string }[]; onRowSelectionChange?: (sel: Record<string, boolean>) => void }) => {
      capturedOnRowSelectionChange = onRowSelectionChange ?? null;
      return <div data-testid="data-table">{String(data.length)} rows</div>;
    },
  };
});

vi.mock("~/components/skeletons/grid-page-skeleton", () => ({
  GridPageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("~/components/library-toolbar", () => ({
  LibraryToolbar: ({ view }: { view: string }) => (
    <div data-testid="library-toolbar" data-view={view} />
  ),
}));

vi.mock("~/hooks/use-library-view-preference", () => ({
  useLibraryViewPreference: () => [mockView, (v: string) => { mockView = v; }],
}));

vi.mock("~/hooks/use-grid-tile-size", () => ({
  useGridTileSize: () => [mockTileSize, (v: string) => { mockTileSize = v; }],
}));

vi.mock("~/lib/sort-filter-works", () => ({}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ShelfDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = { shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [] } };
    mockView = "grid";
    mockTileSize = "small";
    vi.clearAllMocks();
    getAvailableEditionsServerFnMock.mockResolvedValue([]);
    addEditionToShelfServerFnMock.mockResolvedValue({});
  });

  it("loader calls getShelfDetailServerFn", async () => {
    getShelfDetailServerFnMock.mockResolvedValue({ id: "s1", name: "Fiction", formatFilter: "ALL", items: [] });
    const { Route } = await import("./shelves.$shelfId");
    const loader = Route.options.loader as never as (
      args: { params: Record<string, string> },
    ) => Promise<object>;
    const result = await loader({ params: { shelfId: "s1" } });
    expect(getShelfDetailServerFnMock).toHaveBeenCalledWith({ data: { shelfId: "s1" } });
    expect(result).toEqual({ shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [] } });
  });

  it("renders shelf name as heading", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { name: "Fiction" })).toBeTruthy();
  });

  it("renders breadcrumb with link to shelves list", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Shelves").closest("a");
    expect(link?.getAttribute("href")).toBe("/shelves");
  });

  it("shows empty state when no editions on shelf", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No editions on this shelf yet.")).toBeTruthy();
  });

  it("renders format badge", async () => {
    mockLoaderData.shelf.formatFilter = "EBOOK";
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Ebooks")).toBeTruthy();
  });

  it("renders LibraryGrid with works in grid view", async () => {
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("library-grid")).toBeTruthy();
  });

  it("renders table view with edition data", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByTestId("library-grid")).toBeNull();
    expect(screen.getByTestId("data-table")).toBeTruthy();
  });

  it("renders Add Books button", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("add-editions-btn")).toBeTruthy();
  });

  it("opens Add Editions dialog and loads available editions", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([
      { id: "e2", formatFamily: "EBOOK", publisher: "Penguin", work: { titleDisplay: "Brave New World", series: null }, contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Aldous Huxley" } }] },
    ]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeTruthy();
      expect(screen.getByText("Brave New World")).toBeTruthy();
    });
  });

  it("allows selecting and adding editions", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([
      { id: "e2", formatFamily: "EBOOK", publisher: null, work: { titleDisplay: "Brave New World", series: null }, contributors: [] },
    ]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("edition-check-e2")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("edition-check-e2"));
    fireEvent.click(screen.getByTestId("add-selected-btn"));

    await waitFor(() => {
      expect(addEditionToShelfServerFnMock).toHaveBeenCalledWith({
        data: { shelfId: "s1", editionId: "e2" },
      });
    });
  });

  it("supports select all and deselect all", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([
      { id: "e2", formatFamily: "EBOOK", publisher: null, work: { titleDisplay: "Book A", series: null }, contributors: [] },
      { id: "e3", formatFamily: "EBOOK", publisher: null, work: { titleDisplay: "Book B", series: null }, contributors: [] },
    ]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("select-all-editions")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("select-all-editions"));
    expect(screen.getByTestId("add-selected-btn").textContent).toContain("2");

    fireEvent.click(screen.getByTestId("select-all-editions"));
    const addBtn = screen.getByTestId("add-selected-btn");
    expect(addBtn.getAttribute("disabled")).not.toBeNull();
  });

  it("filters editions by text in dialog", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([
      { id: "e2", formatFamily: "EBOOK", publisher: null, work: { titleDisplay: "Brave New World", series: null }, contributors: [] },
      { id: "e3", formatFamily: "EBOOK", publisher: null, work: { titleDisplay: "1984", series: null }, contributors: [] },
    ]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("add-editions-filter")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("add-editions-filter"), { target: { value: "Brave" } });
    expect(screen.getByText("Brave New World")).toBeTruthy();
    expect(screen.queryByTestId("edition-row-e3")).toBeNull();
  });

  it("shows empty state in dialog when no editions available", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByText("No matching editions available.")).toBeTruthy();
    });
  });

  it("shows edition publisher in dialog", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([
      { id: "e2", formatFamily: "EBOOK", publisher: "Penguin Classics", work: { titleDisplay: "1984", series: null }, contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Orwell" } }] },
    ]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Penguin Classics/)).toBeTruthy();
    });
  });

  it("deselects an edition when clicking a selected checkbox", async () => {
    getAvailableEditionsServerFnMock.mockResolvedValue([
      { id: "e2", formatFamily: "EBOOK", publisher: null, work: { titleDisplay: "Book A", series: null }, contributors: [] },
    ]);

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("edition-check-e2")).toBeTruthy();
    });

    // Select
    fireEvent.click(screen.getByTestId("edition-check-e2"));
    expect(screen.getByTestId("add-selected-btn").textContent).toContain("1");

    // Deselect
    fireEvent.click(screen.getByTestId("edition-check-e2"));
    const addBtn = screen.getByTestId("add-selected-btn");
    expect(addBtn.getAttribute("disabled")).not.toBeNull();
  });

  it("catch handler sets empty available when server fn rejects", async () => {
    getAvailableEditionsServerFnMock.mockRejectedValue(new Error("fail"));

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByText("No matching editions available.")).toBeTruthy();
    });
  });

  it("cancel button closes dialog", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("add-editions-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("shows selection bar when rows are selected in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    expect(capturedOnRowSelectionChange).toBeTruthy();
    act(() => { (capturedOnRowSelectionChange as (sel: Record<string, boolean>) => void)({ "0": true }); });

    expect(screen.getByTestId("selection-bar")).toBeTruthy();
    expect(screen.getByText("1 edition selected")).toBeTruthy();
    expect(screen.getByTestId("remove-selected-btn")).toBeTruthy();
  });

  it("shows plural editions in selection bar", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: {
        id: "s1", name: "Fiction", formatFilter: "ALL",
        items: [
          { id: "ci1", edition: mockEdition },
          { id: "ci2", edition: { ...mockEdition, id: "e2" } },
        ],
      },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    act(() => { (capturedOnRowSelectionChange as (sel: Record<string, boolean>) => void)({ "0": true, "1": true }); });
    expect(screen.getByText("2 editions selected")).toBeTruthy();
  });

  it("removes selected editions when clicking remove button", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    removeEditionFromShelfServerFnMock.mockResolvedValue({});
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    act(() => { (capturedOnRowSelectionChange as (sel: Record<string, boolean>) => void)({ "0": true }); });
    fireEvent.click(screen.getByTestId("remove-selected-btn"));

    await waitFor(() => {
      expect(removeEditionFromShelfServerFnMock).toHaveBeenCalledWith({
        data: { shelfId: "s1", editionId: "e1" },
      });
    });
  });

  it("shows error toast when remove fails", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    removeEditionFromShelfServerFnMock.mockRejectedValue(new Error("fail"));
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    act(() => { (capturedOnRowSelectionChange as (sel: Record<string, boolean>) => void)({ "0": true }); });
    fireEvent.click(screen.getByTestId("remove-selected-btn"));

    await waitFor(() => {
      expect(removeEditionFromShelfServerFnMock).toHaveBeenCalled();
    });
  });

  it("clears selection when clicking clear button", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    act(() => { (capturedOnRowSelectionChange as (sel: Record<string, boolean>) => void)({ "0": true }); });
    expect(screen.getByTestId("selection-bar")).toBeTruthy();

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByTestId("selection-bar")).toBeNull();
  });

  it("filters out undefined edition ids from selection", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    removeEditionFromShelfServerFnMock.mockResolvedValue({});
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    // Select an out-of-range index along with a valid one
    act(() => { (capturedOnRowSelectionChange as (sel: Record<string, boolean>) => void)({ "0": true, "99": true }); });
    fireEvent.click(screen.getByTestId("remove-selected-btn"));

    await waitFor(() => {
      expect(removeEditionFromShelfServerFnMock).toHaveBeenCalledTimes(1);
      expect(removeEditionFromShelfServerFnMock).toHaveBeenCalledWith({
        data: { shelfId: "s1", editionId: "e1" },
      });
    });
  });

  it("renders audiobook format badge", async () => {
    mockLoaderData.shelf.formatFilter = "AUDIOBOOK";
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Audiobooks")).toBeTruthy();
  });
});

describe("getAuthors", () => {
  it("returns author names", async () => {
    const { getAuthors } = await import("./shelves.$shelfId");
    const result = getAuthors(mockEdition as never);
    expect(result).toBe("George Orwell");
  });

  it("returns empty string when no authors", async () => {
    const { getAuthors } = await import("./shelves.$shelfId");
    const edition = { ...mockEdition, contributors: [] };
    expect(getAuthors(edition as never)).toBe("");
  });

  it("deduplicates authors", async () => {
    const { getAuthors } = await import("./shelves.$shelfId");
    const edition = {
      ...mockEdition,
      contributors: [
        { role: "AUTHOR", contributor: { id: "c1", nameDisplay: "George Orwell" } },
        { role: "AUTHOR", contributor: { id: "c2", nameDisplay: "George Orwell" } },
      ],
    };
    expect(getAuthors(edition as never)).toBe("George Orwell");
  });

  it("filters out non-author contributors", async () => {
    const { getAuthors } = await import("./shelves.$shelfId");
    const edition = {
      ...mockEdition,
      contributors: [
        { role: "AUTHOR", contributor: { id: "c1", nameDisplay: "George Orwell" } },
        { role: "NARRATOR", contributor: { id: "c2", nameDisplay: "Stephen Fry" } },
      ],
    };
    expect(getAuthors(edition as never)).toBe("George Orwell");
  });
});

type AccessorCol = { accessorFn: (row: never) => string };
type CellCol = { cell: (info: never) => React.ReactNode };
type HeaderCol = { header: (info: never) => React.ReactNode };

function findCol(columns: { id?: string }[], id: string) {
  return (columns as { id?: string }[]).find((c) => c.id === id) as
    AccessorCol & CellCol & HeaderCol;
}

describe("getTableColumns", () => {
  it("returns expected column definitions", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const columns = getTableColumns();
    const ids = columns.map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey);
    expect(ids).toEqual(["select", "titleDisplay", "format", "authors", "publisher", "isbn", "series"]);
  });

  it("titleDisplay accessorFn returns title", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "titleDisplay");
    expect(col.accessorFn(mockEdition as never)).toBe("1984");
  });

  it("titleDisplay cell renders a link", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "titleDisplay");
    const { container } = render(<>{col.cell({ row: { original: mockEdition } } as never)}</>);
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("1984");
  });

  it("format accessorFn returns formatFamily", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "format");
    expect(col.accessorFn(mockEdition as never)).toBe("EBOOK");
  });

  it("format cell renders a badge", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "format");
    const { container } = render(<>{col.cell({ row: { original: mockEdition } } as never)}</>);
    expect(container.textContent).toBe("EBOOK");
  });

  it("authors accessorFn returns author names", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "authors");
    expect(col.accessorFn(mockEdition as never)).toBe("George Orwell");
  });

  it("publisher accessorFn returns publisher", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "publisher");
    expect(col.accessorFn(mockEdition as never)).toBe("Penguin");
  });

  it("publisher accessorFn returns empty string when null", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "publisher");
    expect(col.accessorFn({ ...mockEdition, publisher: null } as never)).toBe("");
  });

  it("isbn accessorFn returns isbn13", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "isbn");
    expect(col.accessorFn(mockEdition as never)).toBe("978-1");
  });

  it("isbn accessorFn falls back to isbn10", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "isbn");
    expect(col.accessorFn({ ...mockEdition, isbn13: null, isbn10: "123456" } as never)).toBe("123456");
  });

  it("isbn accessorFn returns empty string when both null", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "isbn");
    expect(col.accessorFn({ ...mockEdition, isbn13: null, isbn10: null } as never)).toBe("");
  });

  it("series accessorFn returns series name", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "series");
    const editionWithSeries = { ...mockEdition, work: { ...mockEdition.work, series: { name: "Dystopian" } } };
    expect(col.accessorFn(editionWithSeries as never)).toBe("Dystopian");
  });

  it("series accessorFn returns empty string when no series", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "series");
    expect(col.accessorFn(mockEdition as never)).toBe("");
  });

  it("select column header renders checkbox", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "select");
    const toggleMock = vi.fn();
    const { container } = render(
      <>{col.header({ table: { getIsAllPageRowsSelected: () => false, toggleAllPageRowsSelected: toggleMock } } as never)}</>
    );
    const checkbox = container.querySelector("input[type='checkbox']");
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox as Element);
    expect(toggleMock).toHaveBeenCalled();
  });

  it("select column cell renders checkbox", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const col = findCol(getTableColumns(), "select");
    const toggleMock = vi.fn();
    const { container } = render(
      <>{col.cell({ row: { getIsSelected: () => true, toggleSelected: toggleMock } } as never)}</>
    );
    const checkbox = container.querySelector("input[type='checkbox']");
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox as Element);
    expect(toggleMock).toHaveBeenCalled();
  });

  it("column headers render DataTableColumnHeader", async () => {
    const { getTableColumns } = await import("./shelves.$shelfId");
    const columns = getTableColumns();
    const headerCols = columns.filter((c) => c.id !== "select");
    const mockColumn = {
      getCanSort: () => false,
      getIsSorted: () => false,
      toggleSorting: vi.fn(),
    };
    for (const col of headerCols) {
      const headerFn = col.header as never as (info: { column: typeof mockColumn }) => React.ReactNode;
      const { container } = render(<>{headerFn({ column: mockColumn })}</>);
      expect(container.innerHTML).toBeTruthy();
    }
  });
});

describe("editionLabel", () => {
  it("returns author names for an edition", async () => {
    const { editionLabel } = await import("./shelves.$shelfId");
    const edition = {
      id: "e1",
      contributors: [
        { role: "AUTHOR", contributor: { nameDisplay: "George Orwell" } },
      ],
    };
    expect(editionLabel(edition as never)).toBe("George Orwell");
  });

  it("returns empty string when no authors", async () => {
    const { editionLabel } = await import("./shelves.$shelfId");
    const edition = { id: "e1", contributors: [] };
    expect(editionLabel(edition as never)).toBe("");
  });

  it("deduplicates authors", async () => {
    const { editionLabel } = await import("./shelves.$shelfId");
    const edition = {
      id: "e1",
      contributors: [
        { role: "AUTHOR", contributor: { nameDisplay: "Orwell" } },
        { role: "AUTHOR", contributor: { nameDisplay: "Orwell" } },
      ],
    };
    expect(editionLabel(edition as never)).toBe("Orwell");
  });
});
