// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import type * as DataTableModule from "~/components/data-table";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

vi.mock("~/lib/server-fns/shelves", () => ({
  getShelfDetailServerFn: getShelfDetailServerFnMock,
  getAvailableEditionsServerFn: getAvailableEditionsServerFnMock,
  addEditionToShelfServerFn: addEditionToShelfServerFnMock,
}));

vi.mock("~/components/library-grid", () => ({
  LibraryGrid: ({ works, tileSize }: { works: object[]; tileSize?: string }) => (
    <div data-testid="library-grid" data-tile-size={tileSize ?? "small"}>Grid: {String(works.length)} works</div>
  ),
}));

vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return actual;
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

  it("renders table view without grid", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", formatFilter: "ALL", items: [{ id: "ci1", edition: mockEdition }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByTestId("library-grid")).toBeNull();
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
});
