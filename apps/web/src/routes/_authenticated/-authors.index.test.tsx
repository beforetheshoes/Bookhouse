// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  authors: { id: string; nameDisplay: string; workCount: number }[];
} = { authors: [] };

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

const getAuthorsListServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/authors", () => ({
  getAuthorsListServerFn: getAuthorsListServerFnMock,
}));

const makeAuthor = (name: string, workCount: number) => ({
  id: `author-${name.toLowerCase().replace(/\s/g, "-")}`,
  nameDisplay: name,
  workCount,
});

describe("AuthorsListPage", () => {
  beforeEach(() => {
    mockLoaderData = { authors: [] };
    vi.clearAllMocks();
  });

  it("loader calls getAuthorsListServerFn", async () => {
    getAuthorsListServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./authors.index");
    const result = await (Route.options.loader as () => Promise<object>)();
    expect(getAuthorsListServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ authors: [] });
  });

  it("renders 'Authors' heading", async () => {
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Authors")).toBeTruthy();
  });

  it("renders author names", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3), makeAuthor("Brandon Sanderson", 15)],
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Patrick Rothfuss")).toBeTruthy();
    expect(screen.getByText("Brandon Sanderson")).toBeTruthy();
  });

  it("renders work count for each author", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3)],
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/3 works/)).toBeTruthy();
  });

  it("renders singular 'work' for author with one work", async () => {
    mockLoaderData = {
      authors: [makeAuthor("One Book Author", 1)],
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/1 work$/)).toBeTruthy();
  });

  it("links each author to /authors/$authorId", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3)],
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Patrick Rothfuss").closest("a");
    expect(link?.getAttribute("href")).toBe("/authors/author-patrick-rothfuss");
  });

  it("shows empty state when no authors", async () => {
    mockLoaderData = { authors: [] };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No authors found")).toBeTruthy();
  });

  it("search filters authors by name", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3), makeAuthor("Brandon Sanderson", 15)],
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const input = screen.getByPlaceholderText("Search authors...");
    fireEvent.change(input, { target: { value: "patrick" } });
    expect(screen.getByText("Patrick Rothfuss")).toBeTruthy();
    expect(screen.queryByText("Brandon Sanderson")).toBeNull();
  });
});
