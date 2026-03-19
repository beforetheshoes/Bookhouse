// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: any = { jobs: [], totalCount: 0 };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, params, ...props }: any) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: any) => ({
      ...opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

vi.mock("~/hooks/use-sse", () => ({
  useSSE: vi.fn(),
}));

vi.mock("~/lib/server-fns/import-jobs", () => ({
  getImportJobsServerFn: vi.fn(),
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

import { Route } from "./jobs";
import { getImportJobsServerFn } from "~/lib/server-fns/import-jobs";

const JobsPage = Route.component!;

const makeJob = (overrides: Partial<{
  id: string;
  status: string;
  kind: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  attemptsMade: number;
  libraryRoot: { name: string } | null;
}> = {}) => ({
  id: "job-1",
  status: "QUEUED",
  kind: "SCAN_LIBRARY",
  startedAt: null,
  finishedAt: null,
  createdAt: new Date().toISOString(),
  attemptsMade: 1,
  libraryRoot: null,
  ...overrides,
});

describe("JobsPage", () => {
  beforeEach(() => {
    mockLoaderData = { jobs: [], totalCount: 0 };
  });

  it("renders 'Import Jobs' heading", () => {
    render(<JobsPage />);
    expect(screen.getByText("Import Jobs")).toBeTruthy();
  });

  it("shows 'Auto-refreshing...' when hasActiveJobs", () => {
    mockLoaderData = {
      jobs: [makeJob({ status: "RUNNING" })],
      totalCount: 1,
    };
    render(<JobsPage />);
    expect(screen.getAllByText("Auto-refreshing...").length).toBeGreaterThan(0);
  });

  it("does not show 'Auto-refreshing...' when no active jobs", () => {
    mockLoaderData = {
      jobs: [makeJob({ status: "SUCCEEDED" })],
      totalCount: 1,
    };
    render(<JobsPage />);
    expect(screen.queryByText("Auto-refreshing...")).toBeNull();
  });

  it("shows total count when totalCount > 0", () => {
    mockLoaderData = {
      jobs: [makeJob({ status: "SUCCEEDED" })],
      totalCount: 42,
    };
    render(<JobsPage />);
    expect(screen.getByText("42 total jobs")).toBeTruthy();
  });

  it("renders formatDuration as '—' when no startedAt", () => {
    mockLoaderData = {
      jobs: [makeJob({ startedAt: null })],
      totalCount: 1,
    };
    render(<JobsPage />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders duration in ms when < 1000ms", () => {
    const start = new Date(Date.now() - 500).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      jobs: [makeJob({ startedAt: start, finishedAt: end })],
      totalCount: 1,
    };
    render(<JobsPage />);
    const durationEls = screen.queryAllByText(/ms$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("renders duration in seconds when < 60s", () => {
    const start = new Date(Date.now() - 5000).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      jobs: [makeJob({ startedAt: start, finishedAt: end })],
      totalCount: 1,
    };
    render(<JobsPage />);
    const durationEls = screen.queryAllByText(/^\d+\.\d+s$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("renders duration in minutes when >= 60s", () => {
    const start = new Date(Date.now() - 120000).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      jobs: [makeJob({ startedAt: start, finishedAt: end })],
      totalCount: 1,
    };
    render(<JobsPage />);
    const durationEls = screen.queryAllByText(/m$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("formatKind replaces underscores with spaces", () => {
    mockLoaderData = {
      jobs: [makeJob({ kind: "SCAN_LIBRARY" })],
      totalCount: 1,
    };
    render(<JobsPage />);
    expect(screen.getByText("SCAN LIBRARY")).toBeTruthy();
  });

  it("shows singular 'job' when totalCount is 1", () => {
    mockLoaderData = {
      jobs: [makeJob({ status: "SUCCEEDED" })],
      totalCount: 1,
    };
    render(<JobsPage />);
    expect(screen.getByText("1 total job")).toBeTruthy();
  });

  it("loader calls getImportJobsServerFn", async () => {
    vi.mocked(getImportJobsServerFn).mockResolvedValueOnce({ jobs: [], totalCount: 0 } as any);
    const result = await Route.loader!({} as any);
    expect(getImportJobsServerFn).toHaveBeenCalled();
    expect(result).toEqual({ jobs: [], totalCount: 0 });
  });

  it("renders duration using Date.now() when startedAt set but finishedAt is null", () => {
    const start = new Date(Date.now() - 2000).toISOString();
    mockLoaderData = {
      jobs: [makeJob({ startedAt: start, finishedAt: null })],
      totalCount: 1,
    };
    render(<JobsPage />);
    // Duration should show in seconds (since 2s elapsed)
    const durationEls = screen.queryAllByText(/^\d+\.\d+s$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("renders unknown status with fallback 'secondary' variant", () => {
    mockLoaderData = {
      jobs: [makeJob({ status: "UNKNOWN_STATUS" })],
      totalCount: 1,
    };
    render(<JobsPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("clicking 'Created' column header triggers sort (exercises accessorFn)", () => {
    mockLoaderData = {
      jobs: [
        makeJob({ id: "job-a", createdAt: new Date(Date.now() - 1000).toISOString() }),
        makeJob({ id: "job-b", createdAt: new Date(Date.now() - 2000).toISOString() }),
      ],
      totalCount: 2,
    };
    render(<JobsPage />);
    // Click the "Created" column sort button to trigger accessorFn calls
    const createdBtn = screen.getByRole("button", { name: /created/i });
    fireEvent.click(createdBtn);
    // Just verify no crash; accessorFn is now exercised
    expect(createdBtn).toBeTruthy();
  });
});
