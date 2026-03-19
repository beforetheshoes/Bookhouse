// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  libraryRootId: string;
  issues: { items: Array<{ id: string; relativePath: string; mediaKind: string; metadata: unknown; lastSeenAt: string | null }>; total: number };
} = { libraryRootId: "root-1", issues: { items: [], total: 0 } };

const getLibraryIssuesServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/library-roots", () => ({
  getLibraryIssuesServerFn: getLibraryIssuesServerFnMock,
}));

interface MockRoute {
  options: {
    component: React.ComponentType;
    loader: (args: { params: { libraryRootId: string } }) => Promise<unknown>;
  };
  useLoaderData: () => typeof mockLoaderData;
}

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

describe("LibraryIssuesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { libraryRootId: "root-1", issues: { items: [], total: 0 } };
  });

  it("renders heading and back link", async () => {
    const mod = await import("./library-issues.$libraryRootId");
    const { Route } = mod as unknown as { Route: MockRoute };
    const Page = Route.options.component;
    render(<Page />);
    expect(screen.getByText("Library Issues")).toBeTruthy();
    expect(screen.getByText("Back to Libraries")).toBeTruthy();
  });

  it("shows empty state when no issues", async () => {
    const mod = await import("./library-issues.$libraryRootId");
    const { Route } = mod as unknown as { Route: MockRoute };
    const Page = Route.options.component;
    render(<Page />);
    expect(screen.getByText("No issues found for this library.")).toBeTruthy();
  });

  it("renders table with issues", async () => {
    mockLoaderData = {
      libraryRootId: "root-1",
      issues: {
        items: [
          {
            id: "fa-1",
            relativePath: "author/book.epub",
            mediaKind: "EPUB",
            metadata: { status: "unparseable", warnings: ["Bad XML"] },
            lastSeenAt: new Date("2025-01-01").toISOString(),
          },
        ],
        total: 1,
      },
    };
    const mod = await import("./library-issues.$libraryRootId");
    const { Route } = mod as unknown as { Route: MockRoute };
    const Page = Route.options.component;
    render(<Page />);
    expect(screen.getByText("author/book.epub")).toBeTruthy();
    expect(screen.getByText("EPUB")).toBeTruthy();
    expect(screen.getByText("Bad XML")).toBeTruthy();
  });

  it("shows total count", async () => {
    mockLoaderData = {
      libraryRootId: "root-1",
      issues: { items: [], total: 42 },
    };
    const mod = await import("./library-issues.$libraryRootId");
    const { Route } = mod as unknown as { Route: MockRoute };
    const Page = Route.options.component;
    render(<Page />);
    expect(screen.getByText("42 total issues")).toBeTruthy();
  });

  it("loader calls getLibraryIssuesServerFn", async () => {
    getLibraryIssuesServerFnMock.mockResolvedValueOnce({ items: [], total: 0 });
    const mod = await import("./library-issues.$libraryRootId");
    const { Route } = mod as unknown as { Route: MockRoute };
    const loader = Route.options.loader;
    await loader({ params: { libraryRootId: "root-abc" } });
    expect(getLibraryIssuesServerFnMock).toHaveBeenCalledWith({
      data: { libraryRootId: "root-abc", page: 1, pageSize: 50 },
    });
  });

  it("handles metadata without warnings array", async () => {
    mockLoaderData = {
      libraryRootId: "root-1",
      issues: {
        items: [
          {
            id: "fa-2",
            relativePath: "author/broken.epub",
            mediaKind: "EPUB",
            metadata: { status: "unparseable" },
            lastSeenAt: null,
          },
        ],
        total: 1,
      },
    };
    const mod = await import("./library-issues.$libraryRootId");
    const { Route } = mod as unknown as { Route: MockRoute };
    const Page = Route.options.component;
    render(<Page />);
    expect(screen.getByText("author/broken.epub")).toBeTruthy();
  });
});
