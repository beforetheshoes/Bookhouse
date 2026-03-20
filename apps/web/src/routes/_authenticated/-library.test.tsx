// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  works: {
    id: string;
    titleDisplay: string;
    sortTitle: string;
    coverPath: string | null;
    createdAt: Date;
    enrichmentStatus: string;
    series: { id: string; name: string } | null;
    editions: {
      formatFamily: string;
      publisher: string;
      isbn13: string | null;
      isbn10: string | null;
      contributors: { role: string; contributor: { nameDisplay: string } }[];
    }[];
  }[];
  activeJobCount: number;
  progressMap: Record<string, number>;
} = {
  works: [],
  activeJobCount: 0,
  progressMap: {},
};

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
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

vi.mock("~/hooks/use-sse", () => ({
  useSSE: vi.fn(),
}));

const getLibraryWorksServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/library", () => ({
  getLibraryWorksServerFn: getLibraryWorksServerFnMock,
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

vi.mock("~/components/library-grid", () => ({
  LibraryGrid: ({ works, progressMap }: { works: unknown[]; progressMap?: Record<string, number> }) => (
    <div data-testid="library-grid" data-progress-map={progressMap ? JSON.stringify(progressMap) : undefined}>Grid: {String(works.length)} works</div>
  ),
}));

vi.mock("~/components/library-toolbar", () => ({
  LibraryToolbar: (props: Record<string, unknown>) => (
    <div data-testid="library-toolbar" data-view={props.view as string} data-filter={props.filterValue as string} />
  ),
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

const makeWork = (title: string, authors: string[] = [], formats: string[] = [], enrichmentStatus = "ENRICHED") => ({
  id: `work-${title.toLowerCase().replace(/\s/g, "-")}`,
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  coverPath: null,
  createdAt: new Date("2025-01-01"),
  enrichmentStatus,
  series: null,
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
    mockLoaderData = { works: [], activeJobCount: 0, progressMap: {} };
    mockView = "grid";
    vi.clearAllMocks();
  });

  it("loader calls getLibraryWorksServerFn, getActiveJobCountServerFn, and getBulkReadingProgressServerFn", async () => {
    getLibraryWorksServerFnMock.mockResolvedValueOnce([]);
    getActiveJobCountServerFnMock.mockResolvedValueOnce(0);
    getBulkReadingProgressServerFnMock.mockResolvedValueOnce({});
    const { Route } = await import("./library");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getLibraryWorksServerFnMock).toHaveBeenCalled();
    expect(getActiveJobCountServerFnMock).toHaveBeenCalled();
    expect(getBulkReadingProgressServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ works: [], activeJobCount: 0, progressMap: {} });
  });

  it("renders 'Library' heading", async () => {
    mockLoaderData = { works: [makeWork("Test")], activeJobCount: 0, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("renders grid view by default", async () => {
    mockView = "grid";
    mockLoaderData = {
      works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EBOOK"])],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-grid")).toBeTruthy();
  });

  it("renders table view with real DataTable when preference is table", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EBOOK"]), makeWork("Moby Dick", [], [])],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    // Real DataTable exercises getAuthors, getFormats, column accessors
    expect(screen.getByText("The Great Gatsby")).toBeTruthy();
    expect(screen.getByText("Moby Dick")).toBeTruthy();
    expect(screen.getByText("F. Scott Fitzgerald")).toBeTruthy();
  });

  it("renders title as link to work detail in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EBOOK"])],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const titleLink = screen.getByText("The Great Gatsby").closest("a");
    expect(titleLink).toBeTruthy();
    expect(titleLink?.getAttribute("href")).toBe("/library/work-the-great-gatsby");
  });

  it("renders work with no authors showing dash in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [makeWork("Unknown Author Book", [])],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Unknown Author Book")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders work with no editions showing dash for publisher/isbn in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [{
        id: "work-no-editions",
        titleDisplay: "No Editions",
        sortTitle: "no editions",
        coverPath: null,
        createdAt: new Date("2025-01-01"),
        enrichmentStatus: "ENRICHED",
        series: null,
        editions: [],
      }],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("No Editions")).toBeTruthy();
  });

  it("renders format badges in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [makeWork("Test Book", ["Author"], ["AUDIOBOOK"])],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
  });

  it("renders LibraryToolbar", async () => {
    mockLoaderData = { works: [makeWork("Test")], activeJobCount: 0, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByTestId("library-toolbar")).toBeTruthy();
  });

  it("shows empty state when no works and not scanning", async () => {
    mockLoaderData = { works: [], activeJobCount: 0, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("No works yet")).toBeTruthy();
    expect(screen.getByText("settings")).toBeTruthy();
  });

  it("empty state links to settings/libraries", async () => {
    mockLoaderData = { works: [], activeJobCount: 0, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const link = screen.getByText("settings");
    expect(link.getAttribute("href")).toBe("/settings/libraries");
  });

  it("does not show empty state when scanning with no works", async () => {
    mockLoaderData = { works: [], activeJobCount: 1, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("No works yet")).toBeNull();
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("shows scanning indicator when activeJobCount > 0", async () => {
    mockLoaderData = { works: [makeWork("Test")], activeJobCount: 2, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("shows scanning indicator with new count when works.length > prevCount", async () => {
    mockLoaderData = {
      works: [makeWork("Old Book")],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    const { rerender } = render(<LibraryPage />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    mockLoaderData = {
      works: [makeWork("Old Book"), makeWork("New Book")],
      activeJobCount: 1,
      progressMap: {},
    };
    rerender(<LibraryPage />);

    expect(screen.getByText(/Scanning.*new/)).toBeTruthy();
  });

  it("shows processing badge for stub works in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [makeWork("Stub Book", ["Author"], ["EBOOK"], "STUB")],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.getByText("Processing\u2026")).toBeTruthy();
  });

  it("does not show processing badge for enriched works in table view", async () => {
    mockView = "table";
    mockLoaderData = {
      works: [makeWork("Enriched Book", ["Author"], ["EBOOK"], "ENRICHED")],
      activeJobCount: 0,
      progressMap: {},
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText("Processing\u2026")).toBeNull();
  });

  it("passes progressMap to LibraryGrid", async () => {
    mockView = "grid";
    mockLoaderData = {
      works: [makeWork("Test")],
      activeJobCount: 0,
      progressMap: { "work-test": 42 },
    };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    const grid = screen.getByTestId("library-grid");
    expect(grid.getAttribute("data-progress-map")).toBe(JSON.stringify({ "work-test": 42 }));
  });

  it("does not show scanning indicator when activeJobCount is 0", async () => {
    mockLoaderData = { works: [makeWork("Test")], activeJobCount: 0, progressMap: {} };
    const { Route } = await import("./library");
    const LibraryPage = Route.options.component as React.ComponentType;
    render(<LibraryPage />);
    expect(screen.queryByText(/Scanning/)).toBeNull();
  });
});
