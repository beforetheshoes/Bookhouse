// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const defaultFacetCounts = {
  format: [
    { formatFamily: "EBOOK", _count: { _all: 1 } },
  ],
  hasCover: { withCover: 0, withoutCover: 1 },
  series: 0,
};

let mockLoaderData: {
  libraryResult: {
    works: {
      id: string;
      titleDisplay: string;
      titleCanonical: string;
      sortTitle: string;
      coverPath: string | null;
      createdAt: Date;
      enrichmentStatus: string;
      series: { id: string; name: string } | null;
      seriesPosition: number | null;
      editions: {
        formatFamily: string;
        publisher: string;
        isbn13: string | null;
        isbn10: string | null;
        contributors: { role: string; contributor: { nameDisplay: string } }[];
      }[];
    }[];
    totalCount: number;
    facetCounts: typeof defaultFacetCounts;
  };
  activeJobCount: number;
  progressMap: Record<string, number>;
} = {
  libraryResult: {
    works: [],
    totalCount: 0,
    facetCounts: defaultFacetCounts,
  },
  activeJobCount: 0,
  progressMap: {},
};

let mockSearch = { page: 1, pageSize: 50, sort: "title-asc" as const };
const mockRouterInvalidate = vi.fn();
const bulkDeleteWorksServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/deletion", () => ({
  bulkDeleteWorksServerFn: bulkDeleteWorksServerFnMock,
}));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

const mockNavigate = vi.fn().mockImplementation((opts: { search?: (prev: Record<string, unknown>) => unknown }) => {
  if (typeof opts.search === "function") {
    opts.search({});
  }
});

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, params, ...props }: { children?: React.ReactNode; to: string; params?: Record<string, string>; [key: string]: unknown }) => {
      let href = to;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          href = href.replace(`$${key}`, value);
        }
      }
      return <a href={href} {...props}>{children}</a>;
    },
    useRouter: () => ({ invalidate: mockRouterInvalidate, navigate: vi.fn() }),
    useNavigate: () => mockNavigate,
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => {
      // Call validateSearch and loaderDeps to exercise those branches
      if (typeof opts.validateSearch === "function") {
        (opts.validateSearch as (s: unknown) => unknown)({});
      }
      if (typeof opts.loaderDeps === "function") {
        (opts.loaderDeps as (s: { search: unknown }) => unknown)({ search: {} });
      }
      return {
        ...opts,
        options: opts,
        useLoaderData: () => mockLoaderData,
        useSearch: () => mockSearch,
        useRouteContext: () => ({}),
      };
    },
  };
});

vi.mock("~/hooks/use-sse", () => ({
  useSSE: vi.fn(),
}));

const getFilteredLibraryWorksServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/library", () => ({
  getFilteredLibraryWorksServerFn: getFilteredLibraryWorksServerFnMock,
}));

const getActiveJobCountServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/import-jobs", () => ({
  getActiveJobCountServerFn: getActiveJobCountServerFnMock,
}));

const getBulkReadingProgressServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/reading-progress", () => ({
  getBulkReadingProgressServerFn: getBulkReadingProgressServerFnMock,
}));

let mockView = "grid" as "grid" | "table";
const mockSetView = vi.fn();
vi.mock("~/hooks/use-library-view-preference", () => ({
  useLibraryViewPreference: () => [mockView, mockSetView],
}));

let mockTablePrefs: { columnVisibility: Record<string, boolean>; textOverflow: "wrap" | "truncate" } = { columnVisibility: {}, textOverflow: "truncate" };
const mockSetTablePrefs = vi.fn();
vi.mock("~/hooks/use-library-table-preferences", () => ({
  useLibraryTablePreferences: () => [mockTablePrefs, mockSetTablePrefs],
}));

vi.mock("~/components/library-grid", () => ({
  LibraryGrid: ({ works, progressMap }: { works: unknown[]; progressMap?: Record<string, number> }) => (
    <div data-testid="library-grid" data-progress-map={progressMap ? JSON.stringify(progressMap) : undefined}>Grid: {String(works.length)} works</div>
  ),
}));

let capturedToolbarProps: Record<string, unknown> = {};
vi.mock("~/components/library-toolbar", () => ({
  LibraryToolbar: (props: Record<string, unknown>) => {
    capturedToolbarProps = props;
    return (
      <div data-testid="library-toolbar" data-view={props.view as string} data-filter={props.filterValue as string} />
    );
  },
}));

let capturedFiltersProps: Record<string, unknown> = {};
vi.mock("~/components/library-filters", () => ({
  LibraryFilters: (props: Record<string, unknown>) => {
    capturedFiltersProps = props;
    return (
      <div data-testid="library-filters" data-filters={JSON.stringify(props.filters)} />
    );
  },
}));

let capturedPaginationProps: Record<string, unknown> = {};
vi.mock("~/components/library-pagination", () => ({
  LibraryPagination: (props: Record<string, unknown>) => {
    capturedPaginationProps = props;
    return (
      <div data-testid="library-pagination" data-page={String(props.page)} data-total={String(props.totalCount)} />
    );
  },
}));

let capturedColumnPickerProps: Record<string, unknown> = {};
vi.mock("~/components/data-table/data-table-column-picker", () => ({
  DataTableColumnPicker: (props: Record<string, unknown>) => {
    capturedColumnPickerProps = props;
    return <div data-testid="column-picker" />;
  },
}));

// Use real data-table so column cell renderers execute
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return actual;
});

vi.mock("~/components/skeletons/grid-page-skeleton", () => ({
  GridPageSkeleton: () => <div>Loading grid...</div>,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      count > 0
        ? Array.from({ length: Math.min(count, 5) }, (_, i) => ({
            index: i,
            start: i * 48,
            end: (i + 1) * 48,
          }))
        : [],
    getTotalSize: () => count * 48,
  }),
}));

vi.mock("~/lib/library-search-schema", () => ({
  librarySearchSchema: { parse: (v: unknown) => v },
}));

const makeWork = (title: string, authors: string[] = [], formats: string[] = [], enrichmentStatus = "ENRICHED") => ({
  id: `work-${title.toLowerCase().replace(/\s/g, "-")}`,
  titleDisplay: title,
  titleCanonical: title.toLowerCase(),
  sortTitle: title.toLowerCase(),
  coverPath: null,
  createdAt: new Date("2025-01-01"),
  enrichmentStatus,
  series: null,
  seriesPosition: null,
  editions: [
    {
      formatFamily: formats[0] ?? "EBOOK",
      publisher: "Test Publisher",
      isbn13: "1234567890123",
      isbn10: null,
      contributors: authors.map((name) => ({
        role: "AUTHOR",
        contributor: { nameDisplay: name },
      })),
    },
  ],
});

describe("LibraryPage", () => {
  beforeEach(() => {
    mockLoaderData = {
      libraryResult: {
        works: [],
        totalCount: 0,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    mockSearch = { page: 1, pageSize: 50, sort: "title-asc" };
    mockView = "grid";
    mockTablePrefs = { columnVisibility: {}, textOverflow: "truncate" };
    capturedToolbarProps = {};
    capturedFiltersProps = {};
    capturedPaginationProps = {};
    capturedColumnPickerProps = {};
    vi.clearAllMocks();
  });

  it("loader calls getFilteredLibraryWorksServerFn, getActiveJobCountServerFn, and getBulkReadingProgressServerFn", async () => {
    getFilteredLibraryWorksServerFnMock.mockResolvedValueOnce({ works: [], totalCount: 0, facetCounts: defaultFacetCounts });
    getActiveJobCountServerFnMock.mockResolvedValueOnce(0);
    getBulkReadingProgressServerFnMock.mockResolvedValueOnce({});
    const { Route } = await import("./library.index");
    const deps = { page: 1, pageSize: 50, sort: "title-asc" };
    const result = await (Route.options.loader as unknown as (args: Record<string, unknown>) => Promise<unknown>)({ deps });
    expect(getFilteredLibraryWorksServerFnMock).toHaveBeenCalledWith({ data: deps });
    expect(getActiveJobCountServerFnMock).toHaveBeenCalled();
    expect(getBulkReadingProgressServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    });
  });

  it("renders 'Library' heading", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("renders grid view by default", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-grid")).toBeTruthy();
  });

  it("renders table view with real DataTable when preference is table", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EBOOK"]), makeWork("Moby Dick", [], [])],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("The Great Gatsby")).toBeTruthy();
    expect(screen.getByText("Moby Dick")).toBeTruthy();
    expect(screen.getByText("F. Scott Fitzgerald")).toBeTruthy();
  });

  it("renders title as link to work detail in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const titleLink = screen.getByText("The Great Gatsby").closest("a");
    expect(titleLink).toBeTruthy();
    expect(titleLink?.getAttribute("href")).toBe("/library/work-the-great-gatsby");
  });

  it("renders work with no authors showing dash in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Unknown Author Book", [])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Unknown Author Book")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders work with no editions showing dash for publisher/isbn in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [{
          id: "work-no-editions",
          titleDisplay: "No Editions",
          titleCanonical: "no editions",
          sortTitle: "no editions",
          coverPath: null,
          createdAt: new Date("2025-01-01"),
          enrichmentStatus: "ENRICHED",
          series: null,
          seriesPosition: null,
          editions: [],
        }],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("No Editions")).toBeTruthy();
  });

  it("renders format badges in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["AUDIOBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
  });

  it("renders LibraryToolbar", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-toolbar")).toBeTruthy();
  });

  it("renders LibraryFilters", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-filters")).toBeTruthy();
  });

  it("renders LibraryPagination", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-pagination")).toBeTruthy();
  });

  it("shows empty state when no works and not scanning with no filters", async () => {
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("No works yet")).toBeTruthy();
    expect(screen.getByText("settings")).toBeTruthy();
  });

  it("empty state links to settings/libraries", async () => {
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const link = screen.getByText("settings");
    expect(link.getAttribute("href")).toBe("/settings/libraries");
  });

  it("does not show empty state when scanning with no works", async () => {
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 1,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("does not show empty state when filters are active and results are empty", async () => {
    mockSearch = { ...mockSearch, q: "something" } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("shows scanning indicator when activeJobCount > 0", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 2,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("shows scanning indicator with new count when totalCount > prevCount", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Old Book")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { rerender } = render(<LibraryPage />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    mockLoaderData = {
      libraryResult: { works: [makeWork("Old Book"), makeWork("New Book")], totalCount: 2, facetCounts: defaultFacetCounts },
      activeJobCount: 1,
      progressMap: {},
    };
    rerender(<LibraryPage />);

    expect(screen.getByText(/Scanning.*new/)).toBeTruthy();
  });

  it("shows processing badge for stub works in table view when scan is active", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Stub Book", ["Author"], ["EBOOK"], "STUB")],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 1,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Processing\u2026")).toBeTruthy();
  });

  it("does not show processing badge for stub works in table view when no scan is active", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Stub Book", ["Author"], ["EBOOK"], "STUB")],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("Processing\u2026")).toBeNull();
  });

  it("does not show processing badge for enriched works in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Enriched Book", ["Author"], ["EBOOK"], "ENRICHED")],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("Processing\u2026")).toBeNull();
  });

  it("passes progressMap to LibraryGrid", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: { "work-test": 42 },
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const grid = screen.getByTestId("library-grid");
    expect(grid.getAttribute("data-progress-map")).toBe(JSON.stringify({ "work-test": 42 }));
  });

  it("does not show scanning indicator when activeJobCount is 0", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText(/Scanning/)).toBeNull();
  });

  it("navigates with search text when onSearchChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onSearchChange = capturedToolbarProps.onSearchChange as (v: string) => void;
    onSearchChange("hello");
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
      to: ".",
      replace: true,
    }));
  });

  it("navigates with empty q when search is cleared", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onSearchChange = capturedToolbarProps.onSearchChange as (v: string) => void;
    onSearchChange("");
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("navigates with sort when onSortChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onSortChange = capturedToolbarProps.onSortChange as (v: string) => void;
    onSortChange("title-desc");
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("navigates with filters when onFiltersChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onFiltersChange = capturedFiltersProps.onFiltersChange as (v: Record<string, unknown>) => void;
    onFiltersChange({ format: ["EBOOK"] });
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("navigates with page when onPageChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 100, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onPageChange = capturedPaginationProps.onPageChange as (v: number) => void;
    onPageChange(2);
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("navigates with pageSize and page 1 when onPageSizeChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 100, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onPageSizeChange = capturedPaginationProps.onPageSizeChange as (v: number) => void;
    onPageSizeChange(20);
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("filters works by reading status", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Unread"), makeWork("Reading"), makeWork("Done")],
        totalCount: 3,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: { "work-reading": 50, "work-done": 100 },
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { rerender } = render(<LibraryPage />);

    // Initially shows all
    expect(screen.getByText("Grid: 3 works")).toBeTruthy();

    // Switch to reading filter
    const onFilterChange = capturedToolbarProps.onFilterChange as (v: string) => void;
    onFilterChange("reading");
    rerender(<LibraryPage />);
    expect(screen.getByText("Grid: 1 works")).toBeTruthy();
  });

  it("shows finished works when reading filter is finished", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Unread"), makeWork("Done")],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: { "work-done": 100 },
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    const onFilterChange = capturedToolbarProps.onFilterChange as (v: string) => void;
    onFilterChange("finished");
    const { rerender } = render(<LibraryPage />);
    rerender(<LibraryPage />);
    expect(screen.getAllByText(/Grid:/).length).toBeGreaterThan(0);
  });

  it("shows unread works when reading filter is unread", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Unread"), makeWork("Done")],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: { "work-done": 100 },
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    const onFilterChange = capturedToolbarProps.onFilterChange as (v: string) => void;
    onFilterChange("unread");
    const { rerender } = render(<LibraryPage />);
    rerender(<LibraryPage />);
    expect(screen.getAllByText(/Grid:/).length).toBeGreaterThan(0);
  });

  it("does not show empty state when format filter is active", async () => {
    mockSearch = { ...mockSearch, format: ["EBOOK"] } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when authorId filter is active", async () => {
    mockSearch = { ...mockSearch, authorId: ["a1"] } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when seriesId filter is active", async () => {
    mockSearch = { ...mockSearch, seriesId: ["s1"] } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when publisher filter is active", async () => {
    mockSearch = { ...mockSearch, publisher: ["Penguin"] } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when hasCover filter is active", async () => {
    mockSearch = { ...mockSearch, hasCover: true } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("passes search params as toolbar search value", async () => {
    mockSearch = { ...mockSearch, q: "test query" } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(capturedToolbarProps.searchValue).toBe("test query");
  });

  it("passes current filters from search to LibraryFilters", async () => {
    mockSearch = { ...mockSearch, format: ["EBOOK"], hasCover: true } as unknown as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const filters = capturedFiltersProps.filters as Record<string, unknown>;
    expect(filters.format).toEqual(["EBOOK"]);
    expect(filters.hasCover).toBe(true);
  });

  it("renders column picker and text overflow toggle in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("column-picker")).toBeTruthy();
    expect(screen.getByRole("button", { name: /wrap text/i })).toBeTruthy();
  });

  it("does not render column picker or text overflow toggle in grid view", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByTestId("column-picker")).toBeNull();
    expect(screen.queryByRole("button", { name: /wrap text/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /truncate text/i })).toBeNull();
  });

  it("passes columnVisibility from preferences to column picker", async () => {
    mockView = "table";
    mockTablePrefs = { columnVisibility: { isbn: false }, textOverflow: "truncate" };
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(capturedColumnPickerProps.columnVisibility).toEqual({ isbn: false });
  });

  it("calls setTablePrefs when column is toggled", async () => {
    mockView = "table";
    mockTablePrefs = { columnVisibility: {}, textOverflow: "truncate" };
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onToggle = capturedColumnPickerProps.onToggle as (id: string) => void;
    onToggle("isbn");
    expect(mockSetTablePrefs).toHaveBeenCalledWith({
      columnVisibility: { isbn: false },
      textOverflow: "truncate",
    });
  });

  it("calls setTablePrefs when text overflow toggle is clicked", async () => {
    mockView = "table";
    mockTablePrefs = { columnVisibility: {}, textOverflow: "truncate" };
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByRole("button", { name: /wrap text/i }));
    expect(mockSetTablePrefs).toHaveBeenCalledWith({
      columnVisibility: {},
      textOverflow: "wrap",
    });
  });

  it("shows 'Truncate' label when textOverflow is 'wrap' and toggles back to truncate", async () => {
    mockView = "table";
    mockTablePrefs = { columnVisibility: {}, textOverflow: "wrap" };
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const btn = screen.getByRole("button", { name: /truncate text/i });
    expect(btn).toBeTruthy();
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(btn);
    expect(mockSetTablePrefs).toHaveBeenCalledWith({
      columnVisibility: {},
      textOverflow: "truncate",
    });
  });

  it("renders select-all checkbox in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows floating action bar with delete button when rows are selected", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select the row checkbox (first non-header checkbox)
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1]; // 0 is select-all, 1 is row
    if (!rowCheckbox) throw new Error("expected row checkbox");
    fireEvent.click(rowCheckbox);

    expect(screen.getByText(/1 work selected/)).toBeTruthy();
    expect(screen.getByText("Delete Selected")).toBeTruthy();
  });

  it("opens confirmation dialog and calls bulkDeleteWorksServerFn on confirm", async () => {
    bulkDeleteWorksServerFnMock.mockResolvedValue({ deletedWorkIds: ["work-book-a"] });
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select row
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected row checkbox");
    fireEvent.click(rowCheckbox);

    // Click Delete Selected
    fireEvent.click(screen.getByText("Delete Selected"));

    // Confirm dialog appears
    expect(screen.getByText(/will remove 1 work/)).toBeTruthy();

    // Click Delete in dialog
    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(bulkDeleteWorksServerFnMock).toHaveBeenCalledWith({
        data: { workIds: ["work-book-a"] },
      });
    });
  });

  it("shows plural text in success toast when bulk deleting multiple works", async () => {
    bulkDeleteWorksServerFnMock.mockResolvedValue({ deletedWorkIds: ["work-book-a", "work-book-b"] });
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A"), makeWork("Book B")], totalCount: 2, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select all rows
    const selectAllCheckbox = screen.getAllByLabelText("Select all")[0];
    if (!selectAllCheckbox) throw new Error("expected select-all checkbox");
    fireEvent.click(selectAllCheckbox);

    // Click Delete Selected
    fireEvent.click(screen.getByText("Delete Selected"));

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("2 works deleted");
    });
  });

  it("selects all rows when select-all header checkbox is clicked", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A"), makeWork("Book B")], totalCount: 2, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Click select-all checkbox (first checkbox in the table header)
    const selectAllCheckbox = screen.getAllByLabelText("Select all")[0];
    if (!selectAllCheckbox) throw new Error("expected select-all checkbox");
    fireEvent.click(selectAllCheckbox);

    expect(screen.getByText(/2 works selected/)).toBeTruthy();
  });

  it("shows error toast when bulk delete fails", async () => {
    bulkDeleteWorksServerFnMock.mockRejectedValue(new Error("Bulk delete failed"));
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select row
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected row checkbox");
    fireEvent.click(rowCheckbox);

    // Click Delete Selected
    fireEvent.click(screen.getByText("Delete Selected"));

    // Click Delete in dialog
    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Bulk delete failed");
    });
  });

  it("shows generic error toast when bulk delete fails with non-Error", async () => {
    bulkDeleteWorksServerFnMock.mockRejectedValue("something went wrong");
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select row
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected row checkbox");
    fireEvent.click(rowCheckbox);

    // Click Delete Selected
    fireEvent.click(screen.getByText("Delete Selected"));

    // Click Delete in dialog
    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to delete works");
    });
  });

  it("closes bulk delete dialog when cancel button is clicked", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select row
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected row checkbox");
    fireEvent.click(rowCheckbox);

    // Click Delete Selected to open dialog
    fireEvent.click(screen.getByText("Delete Selected"));
    expect(screen.getByText(/will remove 1 work/)).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));
  });

  it("clears selection when Clear button is clicked", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select row
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected row checkbox");
    fireEvent.click(rowCheckbox);

    expect(screen.getByText(/1 work selected/)).toBeTruthy();

    // Click Clear
    fireEvent.click(screen.getByText("Clear"));

    // Action bar should disappear
    expect(screen.queryByText(/work selected/)).toBeNull();
  });
});
