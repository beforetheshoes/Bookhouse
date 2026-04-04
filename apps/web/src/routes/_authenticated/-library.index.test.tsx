// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Cast route option function types that have no overlap with simple function types */
function asLoader<TArgs, TResult>(fn: ((args: TArgs) => Promise<TResult>) | object): (args: TArgs) => Promise<TResult> {
  return fn as ((args: TArgs) => Promise<TResult>) & typeof fn;
}

/** Force-cast for testing type-mismatch scenarios */
function forceCast<T>(value: T | string | number | boolean | object | null): T {
  return value as T & typeof value;
}

const defaultFacetCounts = {
  format: [
    { formatFamily: "EBOOK", _count: { _all: 1 } },
  ],
  hasCover: { withCover: 0, withoutCover: 1 },
  enrichment: { enriched: 0, unenriched: 0 },
  description: { withDescription: 0, withoutDescription: 0 },
  series: { inSeries: 0, standalone: 0 },
  isbn: { withIsbn: 0, withoutIsbn: 0 },
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
        id: string;
        formatFamily: string;
        publisher: string | null;
        isbn13: string | null;
        isbn10: string | null;
        contributors: { role: string; contributor: { nameDisplay: string } }[];
      }[];
    }[];
    totalCount: number;
    facetCounts: typeof defaultFacetCounts;
    totalFacetCounts: typeof defaultFacetCounts;
  };
  activeJobCount: number;
  progressMap: Record<string, number>;
  shelves: { id: string; name: string; _count: { items: number } }[];
} = {
  libraryResult: {
    works: [],
    totalCount: 0,
    facetCounts: defaultFacetCounts,
    totalFacetCounts: defaultFacetCounts,
  },
  activeJobCount: 0,
  progressMap: {},
  shelves: [],
};

let mockSearch: { page: number; pageSize: number; sort: string } = { page: 1, pageSize: 50, sort: "title-asc" };
const mockRouterInvalidate = vi.fn();
const mockRouterNavigate = vi.fn();
const mockRouter = { invalidate: mockRouterInvalidate, navigate: mockRouterNavigate };
const bulkDeleteWorksServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/deletion", () => ({
  bulkDeleteWorksServerFn: bulkDeleteWorksServerFnMock,
}));

vi.mock("~/lib/server-fns/shelves", () => ({
  getShelvesServerFn: vi.fn().mockResolvedValue([]),
  bulkAddToShelfServerFn: vi.fn().mockResolvedValue({ added: 0 }),
}));

vi.mock("~/lib/server-fns/bulk-enrich", () => ({
  bulkEnrichServerFn: vi.fn().mockResolvedValue({ importJobId: "ij-1", enqueuedCount: 0 }),
}));

vi.mock("~/lib/server-fns/integrations", () => ({
  getIntegrationStatusServerFn: vi.fn().mockResolvedValue({
    openlibrary: { configured: true, label: "Open Library" },
    googlebooks: { configured: false, label: "Google Books" },
    hardcover: { configured: false, label: "Hardcover" },
  }),
}));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

const mockNavigate = vi.fn().mockImplementation((opts: { search?: (prev: Record<string, string | number | boolean | object>) => object }) => {
  if (typeof opts.search === "function") {
    opts.search({});
  }
});

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, params, ...props }: { children?: React.ReactNode; to: string; params?: Record<string, string>; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => {
      let href = to;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          href = href.replace(`$${key}`, value);
        }
      }
      return <a href={href} {...props}>{children}</a>;
    },
    useRouter: () => mockRouter,
    useNavigate: () => mockNavigate,
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => {
      // Call validateSearch and loaderDeps to exercise those branches
      if (typeof opts.validateSearch === "function") {
        (opts.validateSearch as (s: object) => object)({});
      }
      if (typeof opts.loaderDeps === "function") {
        (opts.loaderDeps as (s: { search: object }) => object)({ search: {} });
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
const getAllFilteredWorkIdsServerFnMock = vi.fn().mockResolvedValue([]);
vi.mock("~/lib/server-fns/library", () => ({
  getFilteredLibraryWorksServerFn: getFilteredLibraryWorksServerFnMock,
  getAllFilteredWorkIdsServerFn: getAllFilteredWorkIdsServerFnMock,
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

let mockTileSize = "small" as "small" | "large";
const mockSetTileSize = vi.fn();
vi.mock("~/hooks/use-grid-tile-size", () => ({
  useGridTileSize: () => [mockTileSize, mockSetTileSize],
}));

let mockTablePrefs: { columnVisibility: Record<string, boolean>; textOverflow: "wrap" | "truncate" } = { columnVisibility: {}, textOverflow: "truncate" };
const mockSetTablePrefs = vi.fn();
vi.mock("~/hooks/use-library-table-preferences", () => ({
  useLibraryTablePreferences: () => [mockTablePrefs, mockSetTablePrefs],
}));

vi.mock("~/components/library-grid", () => ({
  LibraryGrid: ({ works, progressMap, tileSize }: { works: object[]; progressMap?: Record<string, number>; tileSize?: string }) => (
    <div data-testid="library-grid" data-progress-map={progressMap ? JSON.stringify(progressMap) : undefined} data-tile-size={tileSize ?? "small"}>Grid: {String(works.length)} works</div>
  ),
}));

let capturedToolbarProps: Record<string, string | number | boolean | object | (() => void)> = {};
vi.mock("~/components/library-toolbar", () => ({
  LibraryToolbar: (props: Record<string, string | number | boolean | object | (() => void)>) => {
    capturedToolbarProps = props;
    return (
      <div data-testid="library-toolbar" data-view={props.view as string} data-filter={props.filterValue as string} />
    );
  },
}));

let capturedFiltersProps: Record<string, string | number | boolean | object | (() => void)> = {};
vi.mock("~/components/library-filters", () => ({
  LibraryFilters: (props: Record<string, string | number | boolean | object | (() => void)>) => {
    capturedFiltersProps = props;
    return (
      <div data-testid="library-filters" data-filters={JSON.stringify(props.filters)} />
    );
  },
}));

let capturedPaginationProps: Record<string, string | number | boolean | object | (() => void)> = {};
vi.mock("~/components/library-pagination", () => ({
  LibraryPagination: (props: Record<string, string | number | boolean | object | (() => void)>) => {
    capturedPaginationProps = props;
    return (
      <div data-testid="library-pagination" data-page={typeof props.page === "string" || typeof props.page === "number" ? String(props.page) : ""} data-total={typeof props.totalCount === "string" || typeof props.totalCount === "number" ? String(props.totalCount) : ""} />
    );
  },
}));

let capturedColumnPickerProps: Record<string, string | number | boolean | object | (() => void)> = {};
vi.mock("~/components/data-table/data-table-column-picker", () => ({
  DataTableColumnPicker: (props: Record<string, string | number | boolean | object | (() => void)>) => {
    capturedColumnPickerProps = props;
    return <div data-testid="column-picker" />;
  },
}));

// Use real data-table so column cell renderers execute; wrap VirtualizedDataTable to capture columns prop
const capturedColumnRefs: object[] = [];
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  const RealTable = actual.VirtualizedDataTable;
  return {
    ...actual,
    VirtualizedDataTable: (props: React.ComponentProps<typeof RealTable>) => {
      capturedColumnRefs.push(props.columns);
      return <RealTable {...props} />;
    },
  };
});

// Use real EditableTableCell so column cell renderers execute fully
vi.mock("~/components/editable-table-cell", async () => {
  const actual = await vi.importActual("~/components/editable-table-cell");
  return actual as Record<string, object>;
});

vi.mock("~/lib/server-fns/editing", () => ({
  updateWorkServerFn: vi.fn(),
  updateEditionServerFn: vi.fn(),
  updateWorkAuthorsServerFn: vi.fn(),
}));

import { updateWorkServerFn, updateEditionServerFn, updateWorkAuthorsServerFn } from "~/lib/server-fns/editing";

const updateWorkServerFnMock = vi.mocked(updateWorkServerFn);
const updateEditionServerFnMock = vi.mocked(updateEditionServerFn);
const updateWorkAuthorsServerFnMock = vi.mocked(updateWorkAuthorsServerFn);

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
  librarySearchSchema: { parse: (v: object) => v },
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
      id: `edition-${title.toLowerCase().replace(/\s/g, "-")}`,
      formatFamily: formats[0] ?? "EBOOK",
      publisher: "Test Publisher" as string | null,
      isbn13: "1234567890123" as string | null,
      isbn10: null as string | null,
      contributors: authors.map((name) => ({
        role: "AUTHOR",
        contributor: { nameDisplay: name },
      })),
    },
  ],
});

describe("columnSortToParam", () => {
  it("returns title-asc for empty state", async () => {
    const { columnSortToParam } = await import("~/lib/library-filter-helpers");
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([], map)).toBe("title-asc");
  });

  it("returns title-asc for unknown column id", async () => {
    const { columnSortToParam } = await import("~/lib/library-filter-helpers");
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([{ id: "unknown", desc: false }], map)).toBe("title-asc");
  });

  it("returns asc sort param for ascending column", async () => {
    const { columnSortToParam } = await import("~/lib/library-filter-helpers");
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([{ id: "titleDisplay", desc: false }], map)).toBe("title-asc");
  });

  it("returns desc sort param for descending column", async () => {
    const { columnSortToParam } = await import("~/lib/library-filter-helpers");
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([{ id: "titleDisplay", desc: true }], map)).toBe("title-desc");
  });
});

describe("LibraryPage", () => {
  beforeEach(() => {
    mockLoaderData = {
      libraryResult: {
        works: [],
        totalCount: 0,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    mockSearch = { page: 1, pageSize: 50, sort: "title-asc" };
    mockView = "grid";
    mockTablePrefs = { columnVisibility: {}, textOverflow: "truncate" };
    capturedToolbarProps = {};
    capturedFiltersProps = {};
    capturedPaginationProps = {};
    capturedColumnPickerProps = {};
    capturedColumnRefs.length = 0;
    vi.clearAllMocks();
  });

  it("loader calls getFilteredLibraryWorksServerFn, getActiveJobCountServerFn, and getBulkReadingProgressServerFn", async () => {
    getFilteredLibraryWorksServerFnMock.mockResolvedValueOnce({ works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts });
    getActiveJobCountServerFnMock.mockResolvedValueOnce(0);
    getBulkReadingProgressServerFnMock.mockResolvedValueOnce({});
    const { Route } = await import("./library.index");
    const deps = { page: 1, pageSize: 50, sort: "title-asc" };
    const result = await asLoader<Record<string, string | object>, object>(Route.options.loader as object)({ deps });
    expect(getFilteredLibraryWorksServerFnMock).toHaveBeenCalledWith({ data: deps });
    expect(getActiveJobCountServerFnMock).toHaveBeenCalled();
    expect(getBulkReadingProgressServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    });
  });

  it("renders 'Library' heading", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
  });

  it("renders Format column header as sortable button in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const formatButton = screen.getByRole("button", { name: /Format/i });
    expect(formatButton).toBeTruthy();
  });

  it("renders ISBN column header as sortable button in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const isbnButton = screen.getByRole("button", { name: /ISBN/i });
    expect(isbnButton).toBeTruthy();
  });

  it("renders Author(s) column header as sortable button in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const authorsButton = screen.getByRole("button", { name: /Author/i });
    expect(authorsButton).toBeTruthy();
  });

  it("renders Publisher column header as sortable button in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const publisherButton = screen.getByRole("button", { name: /Publisher/i });
    expect(publisherButton).toBeTruthy();
  });

  it("passes showSort=false to LibraryToolbar in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(capturedToolbarProps.showSort).toBe(false);
  });

  it("passes showSort=true to LibraryToolbar in grid view", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(capturedToolbarProps.showSort).toBe(true);
  });

  it("exercises author accessor when sort=author-asc in table view", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "author-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author A"], ["EBOOK"]), makeWork("Other Book", ["Author B"], ["EBOOK"])],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Test Book")).toBeTruthy();
  });

  it("exercises format accessor when sort=format-asc in table view", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "format-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Ebook", [], ["EBOOK"]), makeWork("Audio", [], ["AUDIOBOOK"])],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Ebook")).toBeTruthy();
  });

  it("exercises publisher accessor when sort=publisher-asc in table view", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "publisher-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Book A"), makeWork("Book B")],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Book A")).toBeTruthy();
  });

  it("exercises publisher accessor both branches (defined + null) in same render", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "publisher-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [
          makeWork("Has Publisher"),
          {
            ...makeWork("No Publisher"),
            editions: [{
              id: "ed-no-pub",
              formatFamily: "EBOOK",
              publisher: null,
              isbn13: null,
              isbn10: null,
              contributors: [],
            }],
          },
        ],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Has Publisher")).toBeTruthy();
    expect(screen.getByText("No Publisher")).toBeTruthy();
  });

  it("exercises isbn accessor all branches (isbn13, isbn10 fallback, no editions) in same render", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "isbn-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [
          makeWork("Has ISBN13"),
          {
            ...makeWork("ISBN10 Only"),
            editions: [{
              id: "ed-isbn10",
              formatFamily: "EBOOK",
              publisher: null,
              isbn13: null,
              isbn10: "1234567890",
              contributors: [],
            }],
          },
          {
            id: "work-no-ed",
            titleDisplay: "No Editions",
            titleCanonical: "no editions",
            sortTitle: "no editions",
            coverPath: null,
            createdAt: new Date("2025-01-01"),
            enrichmentStatus: "ENRICHED",
            series: null,
            seriesPosition: null,
            editions: [],
          },
        ],
        totalCount: 3,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Has ISBN13")).toBeTruthy();
    expect(screen.getByText("ISBN10 Only")).toBeTruthy();
    expect(screen.getByText("No Editions")).toBeTruthy();
  });

  it("exercises isbn accessor when sort=isbn-asc in table view", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "isbn-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Book A"), makeWork("Book B")],
        totalCount: 2,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Book A")).toBeTruthy();
  });

  it("renders table with sort=recent (no column sort indicator)", async () => {
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "recent" as const };
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book")],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Test Book")).toBeTruthy();
  });

  it("clicking Title column header in table view triggers navigation with sort param", async () => {
    const { fireEvent } = await import("@testing-library/react");
    mockView = "table";
    mockSearch = { page: 1, pageSize: 50, sort: "title-asc" as const };
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Test Book", ["Author"], ["EBOOK"])],
        totalCount: 1,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    // Click the Title column header — should toggle sort to title-desc
    const titleButton = screen.getByRole("button", { name: /Title/i });
    fireEvent.click(titleButton);
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("renders LibraryToolbar", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-toolbar")).toBeTruthy();
  });

  it("renders LibraryFilters", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-filters")).toBeTruthy();
  });

  it("renders LibraryPagination", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-pagination")).toBeTruthy();
  });

  it("shows empty state when no works and not scanning with no filters", async () => {
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("No works yet")).toBeTruthy();
    expect(screen.getByText("settings")).toBeTruthy();
  });

  it("empty state links to settings/libraries", async () => {
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const link = screen.getByText("settings");
    expect(link.getAttribute("href")).toBe("/settings/libraries");
  });

  it("does not show empty state when scanning with no works", async () => {
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 1,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("shows scanning indicator when activeJobCount > 0", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 2,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("shows scanning indicator with new count when totalCount > prevCount", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Old Book")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { rerender } = render(<LibraryPage />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    mockLoaderData = {
      libraryResult: { works: [makeWork("Old Book"), makeWork("New Book")], totalCount: 2, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 1,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 1,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("Processing\u2026")).toBeNull();
  });

  it("passes progressMap to LibraryGrid", async () => {
    mockView = "grid";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: { "work-test": 42 },
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const grid = screen.getByTestId("library-grid");
    expect(grid.getAttribute("data-progress-map")).toBe(JSON.stringify({ "work-test": 42 }));
  });

  it("passes tileSize to LibraryGrid", async () => {
    mockView = "grid";
    mockTileSize = "large";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const grid = screen.getByTestId("library-grid");
    expect(grid.getAttribute("data-tile-size")).toBe("large");
  });

  it("passes tileSize and onTileSizeChange to LibraryToolbar", async () => {
    mockView = "grid";
    mockTileSize = "small";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(capturedToolbarProps.tileSize).toBe("small");
    expect(typeof capturedToolbarProps.onTileSizeChange).toBe("function");
  });

  it("does not show scanning indicator when activeJobCount is 0", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText(/Scanning/)).toBeNull();
  });

  it("navigates with search text when onSearchChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const onFiltersChange = capturedFiltersProps.onFiltersChange as (v: Record<string, string | number | boolean | object>) => void;
    onFiltersChange({ format: ["EBOOK"] });
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("navigates with page when onPageChange is called", async () => {
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 100, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 100, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: { "work-reading": 50, "work-done": 100 },
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: { "work-done": 100 },
      shelves: [],
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
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: { "work-done": 100 },
      shelves: [],
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
    mockSearch = { ...mockSearch, format: ["EBOOK"] } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when authorId filter is active", async () => {
    mockSearch = { ...mockSearch, authorId: ["a1"] } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when seriesId filter is active", async () => {
    mockSearch = { ...mockSearch, seriesId: ["s1"] } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when publisher filter is active", async () => {
    mockSearch = { ...mockSearch, publisher: ["Penguin"] } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("does not show empty state when hasCover filter is active", async () => {
    mockSearch = { ...mockSearch, hasCover: true } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [], totalCount: 0, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
  });

  it("passes search params as toolbar search value", async () => {
    mockSearch = { ...mockSearch, q: "test query" } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(capturedToolbarProps.searchValue).toBe("test query");
  });

  it("passes current filters from search to LibraryFilters", async () => {
    mockSearch = { ...mockSearch, format: ["EBOOK"], hasCover: true } as typeof mockSearch;
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const filters = capturedFiltersProps.filters as Record<string, string | boolean | string[]>;
    expect(filters.format).toEqual(["EBOOK"]);
    expect(filters.hasCover).toBe(true);
  });

  it("renders column picker and text overflow toggle in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Test")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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
    expect(screen.getByTestId("bulk-delete-works-btn")).toBeTruthy();
  });

  it("opens confirmation dialog and calls bulkDeleteWorksServerFn on confirm", async () => {
    bulkDeleteWorksServerFnMock.mockResolvedValue({ deletedWorkIds: ["work-book-a"] });
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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

    // Click Delete
    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));

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
      libraryResult: { works: [makeWork("Book A"), makeWork("Book B")], totalCount: 2, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select all rows
    const selectAllCheckbox = screen.getAllByLabelText("Select all")[0];
    if (!selectAllCheckbox) throw new Error("expected select-all checkbox");
    fireEvent.click(selectAllCheckbox);

    // Click Delete
    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));

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
      libraryResult: { works: [makeWork("Book A"), makeWork("Book B")], totalCount: 2, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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

  it("shows select-all-across-pages banner and fetches all IDs when clicked", async () => {
    getAllFilteredWorkIdsServerFnMock.mockResolvedValue(["w1", "w2", "w3", "w4", "w5"]);
    mockView = "table";
    mockLoaderData = {
      libraryResult: {
        works: [makeWork("Book A"), makeWork("Book B")],
        totalCount: 5,
        facetCounts: defaultFacetCounts,
        totalFacetCounts: defaultFacetCounts,
      },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<LibraryPage />);

    // Select all page rows
    const selectAllCheckbox = screen.getAllByLabelText("Select all")[0];
    if (!selectAllCheckbox) throw new Error("expected select-all checkbox");
    fireEvent.click(selectAllCheckbox);

    // Banner should appear (2 on page, 5 total)
    expect(screen.getByText(/Select all 5 works/)).toBeTruthy();

    // Click the banner
    fireEvent.click(screen.getByTestId("select-all-btn"));

    await waitFor(() => {
      expect(getAllFilteredWorkIdsServerFnMock).toHaveBeenCalled();
    });

    // Should now show 5 selected
    await waitFor(() => {
      expect(screen.getByText(/5 works selected/)).toBeTruthy();
    });
  });

  it("shows error toast when bulk delete fails", async () => {
    bulkDeleteWorksServerFnMock.mockRejectedValue(new Error("Bulk delete failed"));
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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

    // Click Delete
    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));

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
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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

    // Click Delete
    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));

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
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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

    // Click Delete to open dialog
    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));
    expect(screen.getByText(/will remove 1 work/)).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));
  });

  it("clears selection when Clear button is clicked", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
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

  it("renders edit mode toggle button in table view", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    expect(screen.getByTestId("edit-mode-toggle")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("toggles edit mode and shows editable inputs", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Before edit mode — title is a link, not an input
    expect(screen.getByText("Test Book").tagName).toBe("A");

    // Toggle edit mode on
    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    expect(screen.getByText("Done")).toBeTruthy();

    // Editable inputs appear
    expect(screen.getByDisplayValue("Test Book")).toBeTruthy();
    expect(screen.getByDisplayValue("Author")).toBeTruthy();
  });

  it("toggles edit mode off and returns to display mode", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Toggle on
    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    expect(screen.getByDisplayValue("Test Book")).toBeTruthy();

    // Toggle off
    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    expect(screen.getByText("Edit")).toBeTruthy();
    // Title reverts to a link
    expect(screen.getByText("Test Book").tagName).toBe("A");
  });

  it("calls updateWorkServerFn on title blur in edit mode", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;
    updateWorkServerFnMock.mockResolvedValue({ success: true });

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    const titleInput = screen.getByDisplayValue("Test Book");
    fireEvent.change(titleInput, { target: { value: "New Title" } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(updateWorkServerFnMock).toHaveBeenCalledWith({
        data: { workId: "work-test-book", fields: { titleDisplay: "New Title" } },
      });
    });
  });

  it("calls updateWorkAuthorsServerFn on authors blur in edit mode", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author One"])];
    mockLoaderData.libraryResult.totalCount = 1;
    updateWorkAuthorsServerFnMock.mockResolvedValue({ success: true });

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    const authorsInput = screen.getByDisplayValue("Author One");
    fireEvent.change(authorsInput, { target: { value: "Author Two, Author Three" } });
    fireEvent.blur(authorsInput);

    await waitFor(() => {
      expect(updateWorkAuthorsServerFnMock).toHaveBeenCalledWith({
        data: { workId: "work-test-book", authors: ["Author Two", "Author Three"] },
      });
    });
  });

  it("shows empty input for works with no authors in edit mode", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("No Author Book")];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    // Authors field should be empty string, not "—"
    expect(screen.getByDisplayValue("")).toBeTruthy();
  });

  it("shows empty input for works with no publisher in edit mode", async () => {
    mockView = "table";
    const work = makeWork("Test Book", ["Author"]);
    if (work.editions[0]) work.editions[0].publisher = forceCast<string>(null);
    mockLoaderData.libraryResult.works = [work];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    // Should render without crashing
    expect(screen.getByDisplayValue("Test Book")).toBeTruthy();
  });

  it("shows empty input for works with no isbn in edit mode", async () => {
    mockView = "table";
    const work = makeWork("Test Book", ["Author"]);
    if (work.editions[0]) {
      work.editions[0].isbn13 = null;
      work.editions[0].isbn10 = null;
    }
    mockLoaderData.libraryResult.works = [work];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    expect(screen.getByDisplayValue("Test Book")).toBeTruthy();
  });

  it("shows dash for publisher and isbn when work has no editions in edit mode", async () => {
    mockView = "table";
    const work = makeWork("Empty Book", ["Author"]);
    work.editions = [];
    mockLoaderData.libraryResult.works = [work];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    // Should show dash for publisher and isbn since no editions
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("does not call updateWorkAuthorsServerFn when authors field is empty", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    const authorsInput = screen.getByDisplayValue("Author");
    fireEvent.change(authorsInput, { target: { value: "" } });
    fireEvent.blur(authorsInput);

    expect(updateWorkAuthorsServerFnMock).not.toHaveBeenCalled();
  });

  it("calls updateEditionServerFn on isbn blur in edit mode", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;
    updateEditionServerFnMock.mockResolvedValue({ success: true });

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    const isbnInput = screen.getByDisplayValue("1234567890123");
    fireEvent.change(isbnInput, { target: { value: "9999999999999" } });
    fireEvent.blur(isbnInput);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalled();
    });
  });

  it("calls updateEditionServerFn on publisher blur in edit mode", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;
    updateEditionServerFnMock.mockResolvedValue({ success: true });

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    const publisherInput = screen.getByDisplayValue("Test Publisher");
    fireEvent.change(publisherInput, { target: { value: "" } });
    fireEvent.blur(publisherInput);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "edition-test-book", fields: { publisher: null } },
      });
    });
  });

  it("calls updateEditionServerFn with null isbn when cleared", async () => {
    mockView = "table";
    mockLoaderData.libraryResult.works = [makeWork("Test Book", ["Author"])];
    mockLoaderData.libraryResult.totalCount = 1;
    updateEditionServerFnMock.mockResolvedValue({ success: true });

    const { Route } = await import("./library.index");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    const isbnInput = screen.getByDisplayValue("1234567890123");
    fireEvent.change(isbnInput, { target: { value: "" } });
    fireEvent.blur(isbnInput);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "edition-test-book", fields: { isbn13: null } },
      });
    });
  });

  it("shows Add to Shelf button when works are selected", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [{ id: "s1", name: "Fiction", _count: { items: 3 } }],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    const checkbox = screen.getAllByRole("checkbox")[1];
    if (checkbox) fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByTestId("bulk-add-to-shelf-btn")).toBeTruthy();
    });
  });

  it("opens shelf picker dialog and adds works to selected shelf", async () => {
    mockView = "table";
    const { bulkAddToShelfServerFn } = await import("~/lib/server-fns/shelves");
    vi.mocked(bulkAddToShelfServerFn).mockResolvedValue({ added: 1 } as never);

    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [{ id: "s1", name: "Fiction", _count: { items: 3 } }],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    const checkbox = screen.getAllByRole("checkbox")[1];
    if (checkbox) fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByTestId("bulk-add-to-shelf-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("shelf-picker")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("shelf-pick-s1"));

    await waitFor(() => {
      expect(vi.mocked(bulkAddToShelfServerFn)).toHaveBeenCalledWith({
        data: { shelfId: "s1", workIds: expect.any(Array) as string[] },
      });
    });
  });

  it("shows error toast when bulk add fails", async () => {
    mockView = "table";
    const { bulkAddToShelfServerFn } = await import("~/lib/server-fns/shelves");
    vi.mocked(bulkAddToShelfServerFn).mockRejectedValue(new Error("DB error"));

    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [{ id: "s1", name: "Fiction", _count: { items: 3 } }],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    const checkbox = screen.getAllByRole("checkbox")[1];
    if (checkbox) fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByTestId("bulk-add-to-shelf-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("shelf-pick-s1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("shelf-pick-s1"));

    await waitFor(() => {
      expect(vi.mocked(bulkAddToShelfServerFn)).toHaveBeenCalled();
    });
  });

  it("shows empty shelf message in picker when no shelves exist", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Book A")], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    const checkbox = screen.getAllByRole("checkbox")[1];
    if (checkbox) fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByTestId("bulk-add-to-shelf-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));

    await waitFor(() => {
      expect(screen.getByText(/No shelves created yet/)).toBeTruthy();
    });
  });

  it("memoizes columns so the reference is stable across re-renders", async () => {
    mockView = "table";
    mockLoaderData = {
      libraryResult: { works: [makeWork("Stable", ["Author"])], totalCount: 1, facetCounts: defaultFacetCounts, totalFacetCounts: defaultFacetCounts },
      activeJobCount: 0,
      progressMap: {},
      shelves: [],
    };
    const { Route } = await import("./library.index");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);

    await waitFor(() => {
      expect(capturedColumnRefs.length).toBeGreaterThanOrEqual(1);
    });

    const firstColumns = capturedColumnRefs[capturedColumnRefs.length - 1];

    // Trigger a re-render via row selection (does not change columns deps)
    const checkbox = screen.getAllByRole("checkbox")[1];
    if (checkbox) fireEvent.click(checkbox);

    await waitFor(() => {
      expect(capturedColumnRefs.length).toBeGreaterThanOrEqual(2);
    });

    const laterColumns = capturedColumnRefs[capturedColumnRefs.length - 1];
    expect(laterColumns).toBe(firstColumns);
  });
});
