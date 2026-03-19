// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  duplicates: {
    leftEdition: { work?: { titleDisplay: string } } | null;
    rightEdition: { work?: { titleDisplay: string } } | null;
    leftFileAsset: { basename: string } | null;
    rightFileAsset: { basename: string } | null;
    reason: string;
    confidence: number | null;
    status: string;
  }[]
} = { duplicates: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getDuplicatesServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/duplicates", () => ({
  getDuplicatesServerFn: (...args: unknown[]) => getDuplicatesServerFnMock(...args),
}));

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      count > 0
        ? Array.from({ length: Math.min(count, 10) }, (_, i) => ({
            index: i,
            start: i * 48,
            end: (i + 1) * 48,
          }))
        : [],
    getTotalSize: () => count * 48,
  }),
}));

const makeDuplicate = (overrides: {
  leftEdition?: { work?: { titleDisplay: string } } | null;
  rightEdition?: { work?: { titleDisplay: string } } | null;
  leftFileAsset?: { basename: string } | null;
  rightFileAsset?: { basename: string } | null;
  status?: string;
  confidence?: number | null;
} = {}) => ({
  leftEdition: null,
  rightEdition: null,
  leftFileAsset: null,
  rightFileAsset: null,
  reason: "SAME_ISBN",
  confidence: null,
  status: "PENDING",
  ...overrides,
});

describe("DuplicatesPage", () => {
  beforeEach(() => {
    mockLoaderData = { duplicates: [] };
    vi.clearAllMocks();
  });

  it("loader calls getDuplicatesServerFn", async () => {
    getDuplicatesServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./duplicates");
    const result = await Route.loader!({} as Parameters<NonNullable<typeof Route.loader>>[0]);
    expect(getDuplicatesServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ duplicates: [] });
  });

  it("renders 'Duplicates' heading", async () => {
    const { Route } = await import("./duplicates");
    const DuplicatesPage = Route.component!;
    render(<DuplicatesPage />);
    expect(screen.getByText("Duplicates")).toBeTruthy();
  });

  it("getItemLabel returns work titleDisplay when edition present (left)", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftEdition: { work: { titleDisplay: "Left Work Title" } },
          rightEdition: { work: { titleDisplay: "Right Work Title" } },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = Route.component!;
    render(<DuplicatesPage />);
    expect(screen.getByText("Left Work Title")).toBeTruthy();
    expect(screen.getByText("Right Work Title")).toBeTruthy();
  });

  it("getItemLabel returns file basename when no edition", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: { basename: "book.epub" },
          rightFileAsset: { basename: "book-copy.epub" },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = Route.component!;
    render(<DuplicatesPage />);
    expect(screen.getByText("book.epub")).toBeTruthy();
    expect(screen.getByText("book-copy.epub")).toBeTruthy();
  });

  it("getItemLabel returns '—' when neither edition nor file asset", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate()],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = Route.component!;
    render(<DuplicatesPage />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders confidence as percentage when number", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({ confidence: 0.75 })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = Route.component!;
    render(<DuplicatesPage />);
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("renders unknown status with fallback 'outline' variant", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({ status: "UNKNOWN_STATUS" })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = Route.component!;
    render(<DuplicatesPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });
});
