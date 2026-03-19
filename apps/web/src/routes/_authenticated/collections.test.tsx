// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: any = { collections: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: any) => ({
      ...opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getCollectionsServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/collections", () => ({
  getCollectionsServerFn: (...args: any[]) => getCollectionsServerFnMock(...args),
}));

// Use real DataTable so column cell renderers execute
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof import("~/components/data-table")>("~/components/data-table");
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
    const result = await Route.loader!({} as any);
    expect(getCollectionsServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ collections: [] });
  });

  it("renders 'Collections' heading", async () => {
    const { Route } = await import("./collections");
    const CollectionsPage = Route.component!;
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
    const CollectionsPage = Route.component!;
    render(<CollectionsPage />);
    expect(screen.getByText("Fantasy")).toBeTruthy();
    expect(screen.getByText("SERIES")).toBeTruthy();
    expect(screen.getByText("Sci-Fi")).toBeTruthy();
    expect(screen.getByText("CUSTOM")).toBeTruthy();
  });

  it("renders filter input", async () => {
    const { Route } = await import("./collections");
    const CollectionsPage = Route.component!;
    render(<CollectionsPage />);
    expect(screen.getByPlaceholderText("Filter by name...")).toBeTruthy();
  });

  it("shows 'No results.' when collections is empty", async () => {
    const { Route } = await import("./collections");
    const CollectionsPage = Route.component!;
    render(<CollectionsPage />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });
});
