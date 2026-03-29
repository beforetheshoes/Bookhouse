// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

type SeriesWork = {
  id: string;
  titleDisplay: string;
  seriesPosition: number | null;
  editions: {
    contributors: {
      role: string;
      contributor: { nameDisplay: string };
    }[];
  }[];
};

type SeriesListItem = {
  id: string;
  name: string;
  _count: { works: number };
  works: SeriesWork[];
};

let mockLoaderData: { seriesList: SeriesListItem[] } = { seriesList: [] };

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

// Use real DataTable so column cell renderers execute
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return actual;
});

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

const getSeriesListServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/series", () => ({
  getSeriesListServerFn: getSeriesListServerFnMock,
}));

const makeWork = (
  id: string,
  title: string,
  position: number | null,
  authorNames: string[],
): SeriesWork => ({
  id,
  titleDisplay: title,
  seriesPosition: position,
  editions: [
    {
      contributors: authorNames.map((name) => ({
        role: "AUTHOR",
        contributor: { nameDisplay: name },
      })),
    },
  ],
});

const makeSeries = (
  name: string,
  works: SeriesWork[],
): SeriesListItem => ({
  id: `series-${name.toLowerCase().replace(/\s/g, "-")}`,
  name,
  _count: { works: works.length },
  works,
});

describe("SeriesListPage", () => {
  beforeEach(() => {
    mockLoaderData = { seriesList: [] };
    vi.clearAllMocks();
  });

  it("loader calls getSeriesListServerFn", async () => {
    getSeriesListServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./series.index");
    const result = await (Route.options.loader as () => Promise<object>)();
    expect(getSeriesListServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ seriesList: [] });
  });

  it("renders 'Series' heading", async () => {
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Series")).toBeTruthy();
  });

  it("renders series names in table", async () => {
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [makeWork("w1", "The Colour of Magic", 1, ["Terry Pratchett"])]),
        makeSeries("Foundation", [makeWork("w2", "Foundation", 1, ["Isaac Asimov"])]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Discworld")).toBeTruthy();
    expect(screen.getByText("Foundation")).toBeTruthy();
  });

  it("series names link to /series/$seriesId", async () => {
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [makeWork("w1", "The Colour of Magic", 1, ["Terry Pratchett"])]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Discworld").closest("a");
    expect(link?.getAttribute("href")).toBe("/series/series-discworld");
  });

  it("renders deduplicated authors for each series", async () => {
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [
          makeWork("w1", "The Colour of Magic", 1, ["Terry Pratchett"]),
          makeWork("w2", "The Light Fantastic", 2, ["Terry Pratchett"]),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // "Terry Pratchett" deduped — appears exactly once
    const matches = screen.getAllByText("Terry Pratchett");
    expect(matches).toHaveLength(1);
  });

  it("renders multiple authors joined by comma", async () => {
    mockLoaderData = {
      seriesList: [
        makeSeries("Good Omens", [
          makeWork("w1", "Good Omens", 1, ["Terry Pratchett", "Neil Gaiman"]),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Terry Pratchett, Neil Gaiman")).toBeTruthy();
  });

  it("renders — when series has no authors", async () => {
    mockLoaderData = {
      seriesList: [
        makeSeries("Unknown", [
          makeWork("w1", "Mystery Book", 1, []),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders book count as a button", async () => {
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [
          makeWork("w1", "The Colour of Magic", 1, ["Terry Pratchett"]),
          makeWork("w2", "The Light Fantastic", 2, ["Terry Pratchett"]),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("button", { name: "2" })).toBeTruthy();
  });

  it("clicking book count shows book list with links to /library/$workId", async () => {
    const user = userEvent.setup();
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [
          makeWork("w1", "The Colour of Magic", 1, ["Terry Pratchett"]),
          makeWork("w2", "The Light Fantastic", 2, ["Terry Pratchett"]),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText("1. The Colour of Magic")).toBeTruthy();
    expect(screen.getByText("2. The Light Fantastic")).toBeTruthy();
    const link = screen.getByText("1. The Colour of Magic").closest("a");
    expect(link?.getAttribute("href")).toBe("/library/w1");
  });

  it("book list shows series position prefix when available", async () => {
    const user = userEvent.setup();
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [
          makeWork("w1", "The Colour of Magic", 1, ["Terry Pratchett"]),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByText("1. The Colour of Magic")).toBeTruthy();
  });

  it("book list omits position prefix when seriesPosition is null", async () => {
    const user = userEvent.setup();
    mockLoaderData = {
      seriesList: [
        makeSeries("Discworld", [
          makeWork("w1", "The Colour of Magic", null, ["Terry Pratchett"]),
        ]),
      ],
    };
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByText("The Colour of Magic")).toBeTruthy();
  });

  it("renders filter input", async () => {
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByPlaceholderText("Filter series...")).toBeTruthy();
  });

  it("shows 'No results.' when empty", async () => {
    const { Route } = await import("./series.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });
});
