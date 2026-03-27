// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockSeriesDetail {
  id: string;
  name: string;
  works: {
    id: string;
    titleDisplay: string;
    sortTitle: string;
    coverPath: string | null;
    enrichmentStatus: string;
    seriesPosition: number | null;
    series: { id: string; name: string } | null;
    editions: {
      formatFamily: string;
      contributors: { role: string; contributor: { nameDisplay: string } }[];
    }[];
  }[];
}

let mockLoaderData: { series: MockSeriesDetail } = {
  series: {
    id: "series-1",
    name: "The Kingkiller Chronicle",
    works: [],
  },
};

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
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
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

vi.mock("~/components/work-card", () => ({
  WorkCard: ({ title, series }: { title: string; series?: string | null }) => (
    <div data-testid="work-card">{title}{series ? ` (${series})` : ""}</div>
  ),
}));

const getSeriesDetailServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/series", () => ({
  getSeriesDetailServerFn: getSeriesDetailServerFnMock,
}));

const makeWork = (title: string, position: number | null, authors: string[] = []) => ({
  id: `work-${title.toLowerCase().replace(/\s/g, "-")}`,
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  coverPath: null,
  enrichmentStatus: "ENRICHED",
  seriesPosition: position,
  series: { id: "series-1", name: "The Kingkiller Chronicle" },
  editions: [
    {
      formatFamily: "EBOOK",
      contributors: authors.map((name) => ({
        role: "AUTHOR",
        contributor: { nameDisplay: name },
      })),
    },
  ],
});

describe("SeriesDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = {
      series: {
        id: "series-1",
        name: "The Kingkiller Chronicle",
        works: [],
      },
    };
    vi.clearAllMocks();
  });

  it("loader calls getSeriesDetailServerFn with seriesId", async () => {
    getSeriesDetailServerFnMock.mockResolvedValueOnce(mockLoaderData.series);
    const { Route } = await import("./series.$seriesId");
    const result = await (Route.options.loader as (args: { params: { seriesId: string } }) => Promise<object>)({
      params: { seriesId: "series-1" },
    });
    expect(getSeriesDetailServerFnMock).toHaveBeenCalledWith({
      data: { seriesId: "series-1" },
    });
    expect(result).toEqual({ series: mockLoaderData.series });
  });

  it("renders series name as heading", async () => {
    const { Route } = await import("./series.$seriesId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The Kingkiller Chronicle");
  });

  it("renders breadcrumb with link to series list", async () => {
    const { Route } = await import("./series.$seriesId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Series");
    expect(link.closest("a")?.getAttribute("href")).toBe("/series");
  });

  it("renders works using WorkCard", async () => {
    mockLoaderData.series.works = [
      makeWork("The Name of the Wind", 1, ["Patrick Rothfuss"]),
      makeWork("The Wise Man's Fear", 2, ["Patrick Rothfuss"]),
    ];
    const { Route } = await import("./series.$seriesId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const cards = screen.getAllByTestId("work-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText(/The Name of the Wind/)).toBeTruthy();
    expect(screen.getByText(/The Wise Man's Fear/)).toBeTruthy();
  });

  it("shows position number alongside each work", async () => {
    mockLoaderData.series.works = [
      makeWork("The Name of the Wind", 1),
    ];
    const { Route } = await import("./series.$seriesId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("#1")).toBeTruthy();
  });

  it("handles works with null seriesPosition", async () => {
    mockLoaderData.series.works = [
      makeWork("The Name of the Wind", 1),
      makeWork("Unknown Position", null),
    ];
    const { Route } = await import("./series.$seriesId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("#1")).toBeTruthy();
    // Null position work renders without position marker
    expect(screen.getByText(/Unknown Position/)).toBeTruthy();
  });

  it("shows empty state when series has no works", async () => {
    mockLoaderData.series.works = [];
    const { Route } = await import("./series.$seriesId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No works in this series")).toBeTruthy();
  });

  it("renders pending skeleton", async () => {
    const { Route } = await import("./series.$seriesId");
    const Skeleton = Route.options.pendingComponent as React.ComponentType;
    render(<Skeleton />);
    expect(screen.getByText("Loading grid...")).toBeTruthy();
  });
});
