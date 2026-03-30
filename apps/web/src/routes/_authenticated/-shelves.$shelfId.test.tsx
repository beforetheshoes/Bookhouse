// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import type * as DataTableModule from "~/components/data-table";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWork = {
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
  editions: [{
    id: "e1",
    formatFamily: "EBOOK",
    contributors: [{ role: "AUTHOR", contributor: { id: "c1", nameDisplay: "George Orwell" } }],
  }],
};

let mockLoaderData: {
  shelf: {
    id: string;
    name: string;
    items: { id: string; work: typeof mockWork }[];
  };
} = {
  shelf: { id: "s1", name: "Fiction", items: [] },
};

let mockView = "grid";
let mockTileSize = "small";

const getShelfDetailServerFnMock = vi.fn();
const addWorkToShelfServerFnMock = vi.fn().mockResolvedValue({});
const removeWorkFromShelfServerFnMock = vi.fn().mockResolvedValue({});
const searchLibraryServerFnMock = vi.fn().mockResolvedValue({ works: [], authors: [], series: [] });

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
  addWorkToShelfServerFn: addWorkToShelfServerFnMock,
  removeWorkFromShelfServerFn: removeWorkFromShelfServerFnMock,
}));

vi.mock("~/lib/server-fns/search", () => ({
  searchLibraryServerFn: searchLibraryServerFnMock,
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

vi.mock("~/components/work-card", () => ({
  WorkCard: ({ id, title }: { id: string; title: string }) => <div data-testid={`work-${id}`}>{title}</div>,
}));

vi.mock("~/components/skeletons/grid-page-skeleton", () => ({
  GridPageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("~/components/library-toolbar", () => ({
  LibraryToolbar: ({ view, onViewChange, tileSize, onTileSizeChange }: { view: string; onViewChange: (v: string) => void; tileSize: string; onTileSizeChange: (v: string) => void }) => (
    <div data-testid="library-toolbar" data-view={view} data-tile-size={tileSize}>
      <button data-testid="view-grid" onClick={() => { onViewChange("grid"); }}>Grid</button>
      <button data-testid="view-table" onClick={() => { onViewChange("table"); }}>Table</button>
      <button data-testid="tile-small" onClick={() => { onTileSizeChange("small"); }}>Small</button>
      <button data-testid="tile-large" onClick={() => { onTileSizeChange("large"); }}>Large</button>
    </div>
  ),
}));

vi.mock("~/hooks/use-library-view-preference", () => ({
  useLibraryViewPreference: () => [mockView, (v: string) => { mockView = v; }],
}));

vi.mock("~/hooks/use-grid-tile-size", () => ({
  useGridTileSize: () => [mockTileSize, (v: string) => { mockTileSize = v; }],
}));

vi.mock("~/lib/sort-filter-works", () => ({}));

describe("ShelfDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = { shelf: { id: "s1", name: "Fiction", items: [] } };
    mockView = "grid";
    mockTileSize = "small";
    vi.clearAllMocks();
    addWorkToShelfServerFnMock.mockResolvedValue({});
    removeWorkFromShelfServerFnMock.mockResolvedValue({});
    searchLibraryServerFnMock.mockResolvedValue({ works: [], authors: [], series: [] });
  });

  it("loader calls getShelfDetailServerFn", async () => {
    getShelfDetailServerFnMock.mockResolvedValue({ id: "s1", name: "Fiction", items: [] });
    const { Route } = await import("./shelves.$shelfId");
    const loader = Route.options.loader as never as (
      args: { params: Record<string, string> },
    ) => Promise<object>;
    const result = await loader({ params: { shelfId: "s1" } });
    expect(getShelfDetailServerFnMock).toHaveBeenCalledWith({ data: { shelfId: "s1" } });
    expect(result).toEqual({ shelf: { id: "s1", name: "Fiction", items: [] } });
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

  it("shows empty state when no works on shelf", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No works on this shelf yet.")).toBeTruthy();
  });

  it("renders LibraryGrid in grid view", async () => {
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", items: [{ id: "ci1", work: mockWork }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("library-grid")).toBeTruthy();
    expect(screen.getByText("Grid: 1 works")).toBeTruthy();
  });

  it("does not render LibraryGrid in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", items: [{ id: "ci1", work: mockWork }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByTestId("library-grid")).toBeNull();
  });

  it("renders toolbar with view toggles", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("library-toolbar")).toBeTruthy();
    expect(screen.getByTestId("view-grid")).toBeTruthy();
    expect(screen.getByTestId("view-table")).toBeTruthy();
  });

  it("toggles search panel when clicking Add Works", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    expect(screen.getByTestId("add-works-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    expect(screen.queryByTestId("add-works-panel")).toBeNull();
  });

  it("shows search results after typing", async () => {
    searchLibraryServerFnMock.mockResolvedValue({
      works: [{ id: "w2", titleDisplay: "Brave New World", editions: [{ formatFamily: "EBOOK", contributors: [{ role: "AUTHOR", contributor: { id: "c2", nameDisplay: "Aldous Huxley" } }] }] }],
      authors: [],
      series: [],
    });

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    fireEvent.change(screen.getByTestId("add-works-search"), { target: { value: "brave" } });

    await waitFor(() => {
      expect(screen.getByText("Brave New World")).toBeTruthy();
    });
  });

  it("calls addWorkToShelfServerFn when clicking Add", async () => {
    searchLibraryServerFnMock.mockResolvedValue({
      works: [{ id: "w2", titleDisplay: "Brave New World", editions: [{ formatFamily: "EBOOK", contributors: [{ role: "AUTHOR", contributor: { id: "c2", nameDisplay: "Huxley" } }] }] }],
      authors: [],
      series: [],
    });

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    fireEvent.change(screen.getByTestId("add-works-search"), { target: { value: "brave" } });

    await waitFor(() => {
      expect(screen.getByText("Brave New World")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(addWorkToShelfServerFnMock).toHaveBeenCalledWith({
        data: { shelfId: "s1", workId: "w2" },
      });
    });
  });

  it("filters out already-shelved works from search results", async () => {
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", items: [{ id: "ci1", work: mockWork }] },
    };
    searchLibraryServerFnMock.mockResolvedValue({
      works: [{ id: "w1", titleDisplay: "1984", editions: [] }],
      authors: [],
      series: [],
    });

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    fireEvent.change(screen.getByTestId("add-works-search"), { target: { value: "1984" } });

    await waitFor(() => {
      expect(searchLibraryServerFnMock).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("search-result")).toBeNull();
  });

  it("shows no matching works message", async () => {
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    fireEvent.change(screen.getByTestId("add-works-search"), { target: { value: "zzz" } });

    await waitFor(() => {
      expect(screen.getByText("No matching works found.")).toBeTruthy();
    });
  });

  it("renders LibraryToolbar", async () => {
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", items: [{ id: "ci1", work: mockWork }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("library-toolbar")).toBeTruthy();
  });

  it("renders grid view by default", async () => {
    mockView = "grid";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", items: [{ id: "ci1", work: mockWork }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("library-grid")).toBeTruthy();
  });

  it("renders table view when preference is table", async () => {
    mockView = "table";
    mockLoaderData = {
      shelf: { id: "s1", name: "Fiction", items: [{ id: "ci1", work: mockWork }] },
    };
    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByTestId("library-grid")).toBeNull();
  });

  it("clears search results when query is too short", async () => {
    searchLibraryServerFnMock.mockResolvedValue({
      works: [{ id: "w2", titleDisplay: "Test", editions: [] }],
      authors: [],
      series: [],
    });

    const { Route } = await import("./shelves.$shelfId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("toggle-add-works"));
    fireEvent.change(screen.getByTestId("add-works-search"), { target: { value: "te" } });

    await waitFor(() => {
      expect(searchLibraryServerFnMock).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId("add-works-search"), { target: { value: "t" } });
    expect(screen.queryByTestId("search-result")).toBeNull();
  });
});
