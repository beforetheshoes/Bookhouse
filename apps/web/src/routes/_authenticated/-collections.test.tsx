// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: { collections: { name: string; kind: string; _count: { items: number } }[] } = { collections: [] };

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

const getCollectionsServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/collections", () => ({
  getCollectionsServerFn: getCollectionsServerFnMock,
}));

// Use real DataTable so column cell renderers execute
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return actual;
});

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

describe("CollectionsPage", () => {
  beforeEach(() => {
    mockLoaderData = { collections: [] };
    vi.clearAllMocks();
  });

  it("loader calls getCollectionsServerFn", async () => {
    getCollectionsServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./collections");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getCollectionsServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ collections: [] });
  });

  it("renders 'Collections' heading", async () => {
    const { Route } = await import("./collections");
    const CollectionsPage = (Route.options.component as React.ComponentType);
    render(<CollectionsPage />);
    expect(screen.getByText("Collections")).toBeTruthy();
  });

  it("renders collection data in table with cell renderers", async () => {
    mockLoaderData = {
      collections: [
        { name: "Fantasy", kind: "SERIES", _count: { items: 5 } },
        { name: "Sci-Fi", kind: "CUSTOM", _count: { items: 3 } },
      ],
    };
    const { Route } = await import("./collections");
    const CollectionsPage = (Route.options.component as React.ComponentType);
    render(<CollectionsPage />);
    expect(screen.getByText("Fantasy")).toBeTruthy();
    expect(screen.getByText("SERIES")).toBeTruthy();
    expect(screen.getByText("Sci-Fi")).toBeTruthy();
    expect(screen.getByText("CUSTOM")).toBeTruthy();
  });

  it("renders filter input", async () => {
    const { Route } = await import("./collections");
    const CollectionsPage = (Route.options.component as React.ComponentType);
    render(<CollectionsPage />);
    expect(screen.getByPlaceholderText("Filter by name...")).toBeTruthy();
  });

  it("shows 'No results.' when collections is empty", async () => {
    const { Route } = await import("./collections");
    const CollectionsPage = (Route.options.component as React.ComponentType);
    render(<CollectionsPage />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });
});
