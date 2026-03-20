// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  seriesList: {
    id: string;
    name: string;
    _count: { works: number };
    works: { coverPath: string | null }[];
  }[];
} = { seriesList: [] };

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
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

vi.mock("~/components/skeletons/grid-page-skeleton", () => ({
  GridPageSkeleton: () => <div>Loading grid...</div>,
}));

const getSeriesListServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/series", () => ({
  getSeriesListServerFn: getSeriesListServerFnMock,
}));

const makeSeries = (name: string, workCount: number, coverPath: string | null = null) => ({
  id: `series-${name.toLowerCase().replace(/\s/g, "-")}`,
  name,
  _count: { works: workCount },
  works: coverPath ? [{ coverPath }] : [],
});

describe("SeriesListPage", () => {
  beforeEach(() => {
    mockLoaderData = { seriesList: [] };
    vi.clearAllMocks();
  });

  it("loader calls getSeriesListServerFn", async () => {
    getSeriesListServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./series");
    const result = await (Route.options.loader as () => Promise<unknown>)();
    expect(getSeriesListServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ seriesList: [] });
  });

  it("renders 'Series' heading", async () => {
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Series")).toBeTruthy();
  });

  it("renders series names", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Discworld", 41), makeSeries("Foundation", 7)],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Discworld")).toBeTruthy();
    expect(screen.getByText("Foundation")).toBeTruthy();
  });

  it("renders work count for each series", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Discworld", 41)],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/41 books/)).toBeTruthy();
  });

  it("renders singular 'book' for series with one work", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Standalone", 1)],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/1 book$/)).toBeTruthy();
  });

  it("links each series card to /series/$seriesId", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Discworld", 41)],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Discworld").closest("a");
    expect(link?.getAttribute("href")).toBe("/series/series-discworld");
  });

  it("renders cover thumbnail when first work has coverPath", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Discworld", 41, "/covers/disc.jpg")],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const img = screen.getByAltText("Discworld");
    expect(img).toBeTruthy();
  });

  it("renders placeholder when no cover", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Discworld", 41)],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("series-cover-placeholder-series-discworld")).toBeTruthy();
  });

  it("shows empty state when no series", async () => {
    mockLoaderData = { seriesList: [] };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No series found")).toBeTruthy();
  });

  it("search filters series by name", async () => {
    mockLoaderData = {
      seriesList: [makeSeries("Discworld", 41), makeSeries("Foundation", 7)],
    };
    const { Route } = await import("./series");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const input = screen.getByPlaceholderText("Search series...");
    fireEvent.change(input, { target: { value: "disc" } });
    expect(screen.getByText("Discworld")).toBeTruthy();
    expect(screen.queryByText("Foundation")).toBeNull();
  });
});
