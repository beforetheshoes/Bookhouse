// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  authors: { id: string; nameDisplay: string; workCount: number; imagePath: string | null }[];
  enrichingCount: number;
} = { authors: [], enrichingCount: 0 };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    useRouter: () => ({ invalidate: vi.fn() }),
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
const enrichAuthorPhotosServerFnMock = vi.fn().mockResolvedValue({ enqueuedCount: 0 });
const getEnrichAuthorPhotosProgressServerFnMock = vi.fn().mockResolvedValue({ activeCount: 0 });
vi.mock("~/lib/server-fns/authors", () => ({
  getAuthorsListServerFn: getAuthorsListServerFnMock,
  enrichAuthorPhotosServerFn: enrichAuthorPhotosServerFnMock,
  getEnrichAuthorPhotosProgressServerFn: getEnrichAuthorPhotosProgressServerFnMock,
}));

vi.mock("~/lib/mutation", () => ({
  runMutation: async (fn: () => Promise<object>) => fn(),
}));

vi.mock("~/hooks/use-sse", () => ({
  useSSE: vi.fn(),
}));

const makeAuthor = (name: string, workCount: number, imagePath: string | null = null) => ({
  id: `author-${name.toLowerCase().replace(/\s/g, "-")}`,
  nameDisplay: name,
  workCount,
  imagePath,
});

describe("AuthorsListPage", () => {
  beforeEach(() => {
    mockLoaderData = { authors: [], enrichingCount: 0 };
    vi.clearAllMocks();
  });

  it("loader calls getAuthorsListServerFn and getEnrichAuthorPhotosProgressServerFn", async () => {
    getAuthorsListServerFnMock.mockResolvedValueOnce([]);
    getEnrichAuthorPhotosProgressServerFnMock.mockResolvedValueOnce({ activeCount: 3 });
    const { Route } = await import("./authors.index");
    const result = await (Route.options.loader as () => Promise<object>)();
    expect(getAuthorsListServerFnMock).toHaveBeenCalled();
    expect(getEnrichAuthorPhotosProgressServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ authors: [], enrichingCount: 3 });
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
      enrichingCount: 0,
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
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/3 works/)).toBeTruthy();
  });

  it("renders singular 'work' for author with one work", async () => {
    mockLoaderData = {
      authors: [makeAuthor("One Book Author", 1)],
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/1 work$/)).toBeTruthy();
  });

  it("links each author to /authors/$authorId", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3)],
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Patrick Rothfuss").closest("a");
    expect(link?.getAttribute("href")).toBe("/authors/author-patrick-rothfuss");
  });

  it("shows empty state when no authors", async () => {
    mockLoaderData = { authors: [], enrichingCount: 0 };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No authors found")).toBeTruthy();
  });

  it("renders author photo when imagePath is set", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3, "author-patrick-rothfuss")],
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    const { container } = render(<Page />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/api/authors/author-patrick-rothfuss/thumb");
  });

  it("renders fallback icon when imagePath is null", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3, null)],
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    const { container } = render(<Page />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows 'Fetching Photos...' when enrichingCount > 0", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3)],
      enrichingCount: 5,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Fetching Photos...")).toBeTruthy();
    const button = screen.getByText("Fetching Photos...").closest("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("renders Fetch Photos button", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3)],
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Fetch Photos")).toBeTruthy();
  });

  it("calls enrichAuthorPhotosServerFn when Fetch Photos is clicked", async () => {
    enrichAuthorPhotosServerFnMock.mockResolvedValue({ enqueuedCount: 5 });
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3)],
      enrichingCount: 0,
    };
    const { Route } = await import("./authors.index");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const button = screen.getByText("Fetch Photos").closest("button") as HTMLButtonElement;
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(enrichAuthorPhotosServerFnMock).toHaveBeenCalled();
    });
  });

  it("search filters authors by name", async () => {
    mockLoaderData = {
      authors: [makeAuthor("Patrick Rothfuss", 3), makeAuthor("Brandon Sanderson", 15)],
      enrichingCount: 0,
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
