// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  author: {
    id: string;
    nameDisplay: string;
    nameCanonical: string;
    works: {
      id: string;
      titleDisplay: string;
      sortTitle: string;
      coverPath: string | null;
      enrichmentStatus: string;
      series: { id: string; name: string } | null;
      editions: {
        formatFamily: string;
        contributors: { role: string; contributor: { nameDisplay: string } }[];
      }[];
    }[];
  };
} = {
  author: { id: "a1", nameDisplay: "Patrick Rothfuss", nameCanonical: "patrick rothfuss", works: [] },
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

vi.mock("~/components/work-card", () => ({
  WorkCard: ({ title }: { title: string }) => <div data-testid="work-card">{title}</div>,
}));

const getAuthorDetailServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/authors", () => ({
  getAuthorDetailServerFn: getAuthorDetailServerFnMock,
}));

const makeWork = (title: string, formats: string[] = ["EBOOK"]) => ({
  id: `work-${title.toLowerCase().replace(/\s/g, "-")}`,
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  coverPath: null,
  enrichmentStatus: "ENRICHED",
  series: null,
  editions: formats.map((f) => ({
    formatFamily: f,
    contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Patrick Rothfuss" } }],
  })),
});

describe("AuthorDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = {
      author: { id: "a1", nameDisplay: "Patrick Rothfuss", nameCanonical: "patrick rothfuss", works: [] },
    };
    vi.clearAllMocks();
  });

  it("loader calls getAuthorDetailServerFn with authorId", async () => {
    getAuthorDetailServerFnMock.mockResolvedValueOnce(mockLoaderData.author);
    const { Route } = await import("./authors.$authorId");
    const result = await (Route.options.loader as (args: { params: { authorId: string } }) => Promise<unknown>)({
      params: { authorId: "a1" },
    });
    expect(getAuthorDetailServerFnMock).toHaveBeenCalledWith({
      data: { authorId: "a1" },
    });
    expect(result).toEqual({ author: mockLoaderData.author });
  });

  it("renders author name as heading", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Patrick Rothfuss");
  });

  it("renders breadcrumb with link to authors list", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Authors");
    expect(link.closest("a")?.getAttribute("href")).toBe("/authors");
  });

  it("renders works using WorkCard", async () => {
    mockLoaderData.author.works = [
      makeWork("The Name of the Wind"),
      makeWork("The Wise Man's Fear"),
    ];
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const cards = screen.getAllByTestId("work-card");
    expect(cards).toHaveLength(2);
  });

  it("renders dash when work has no author contributors", async () => {
    mockLoaderData.author.works = [
      {
        id: "work-no-authors",
        titleDisplay: "Mystery Book",
        sortTitle: "mystery book",
        coverPath: null,
        enrichmentStatus: "ENRICHED",
        series: null,
        editions: [{ formatFamily: "EBOOK", contributors: [] }],
      },
    ];
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("work-card")).toBeTruthy();
  });

  it("shows empty state when author has no works", async () => {
    mockLoaderData.author.works = [];
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No works by this author")).toBeTruthy();
  });

  it("renders pending skeleton", async () => {
    const { Route } = await import("./authors.$authorId");
    const Skeleton = Route.options.pendingComponent as React.ComponentType;
    render(<Skeleton />);
    expect(screen.getByText("Loading grid...")).toBeTruthy();
  });
});
