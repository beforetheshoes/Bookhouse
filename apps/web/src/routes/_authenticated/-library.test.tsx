// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  works: {
    titleDisplay: string;
    sortTitle: string;
    editions: {
      formatFamily: string;
      publisher: string;
      isbn13: string | null;
      isbn10: string | null;
      contributors: { role: string; contributor: { nameDisplay: string } }[];
    }[];
  }[];
  activeJobCount: number;
} = {
  works: [],
  activeJobCount: 0,
};

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
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

// Use real data-table so column cell renderers execute
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return actual;
});

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
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

const makeWork = (title: string, authors: string[] = [], formats: string[] = []) => ({
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  editions: [
    {
      formatFamily: formats[0] ?? "EPUB",
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
    mockLoaderData = { works: [], activeJobCount: 0 };
    vi.clearAllMocks();
  });

  it("loader calls getLibraryWorksServerFn and getActiveJobCountServerFn", async () => {
    getLibraryWorksServerFnMock.mockResolvedValueOnce([]);
    getActiveJobCountServerFnMock.mockResolvedValueOnce(0);
    const { Route } = await import("./library");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getLibraryWorksServerFnMock).toHaveBeenCalled();
    expect(getActiveJobCountServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ works: [], activeJobCount: 0 });
  });

  it("renders 'Library' heading", async () => {
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    render(<LibraryPage />);
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("renders works data with real DataTable (exercises getAuthors and getFormats)", async () => {
    mockLoaderData = {
      works: [makeWork("The Great Gatsby", ["F. Scott Fitzgerald"], ["EPUB"]), makeWork("Moby Dick", [], [])],
      activeJobCount: 0,
    };
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    render(<LibraryPage />);
    expect(screen.getByText("The Great Gatsby")).toBeTruthy();
    expect(screen.getByText("Moby Dick")).toBeTruthy();
    // Author column should be rendered
    expect(screen.getByText("F. Scott Fitzgerald")).toBeTruthy();
  });

  it("renders work with no authors showing dash", async () => {
    mockLoaderData = {
      works: [makeWork("Unknown Author Book", [])],
      activeJobCount: 0,
    };
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    render(<LibraryPage />);
    expect(screen.getByText("Unknown Author Book")).toBeTruthy();
    // getAuthors returns "—" when no authors
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders work with no editions showing dash for publisher/isbn", async () => {
    mockLoaderData = {
      works: [{
        titleDisplay: "No Editions",
        sortTitle: "no editions",
        editions: [],
      }],
      activeJobCount: 0,
    };
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    render(<LibraryPage />);
    expect(screen.getByText("No Editions")).toBeTruthy();
  });

  it("shows scanning indicator when activeJobCount > 0", async () => {
    mockLoaderData = { works: [], activeJobCount: 2 };
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    render(<LibraryPage />);
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("shows scanning indicator with new count when works.length > prevCount", async () => {
    // First render with works and not scanning, to set prevCount
    mockLoaderData = {
      works: [makeWork("Old Book")],
      activeJobCount: 0,
    };
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    const { rerender } = render(<LibraryPage />);

    // Wait for effect to set prevCount = 1
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now update to scanning with more works
    mockLoaderData = {
      works: [makeWork("Old Book"), makeWork("New Book")],
      activeJobCount: 1,
    };
    rerender(<LibraryPage />);

    // newCount = 2 - 1 = 1 > 0, should show "— 1 new"
    expect(screen.getByText(/Scanning.*new/)).toBeTruthy();
  });

  it("does not show scanning indicator when activeJobCount is 0", async () => {
    mockLoaderData = { works: [], activeJobCount: 0 };
    const { Route } = await import("./library");
    const LibraryPage = (Route.options.component as React.ComponentType);
    render(<LibraryPage />);
    expect(screen.queryByText(/Scanning/)).toBeNull();
  });
});
