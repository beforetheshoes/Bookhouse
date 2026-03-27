// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  job: {
    id: string;
    status: string;
    kind: string;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    attemptsMade: number;
    libraryRoot: { name: string } | null;
    bullmqJobId: string | null;
    error: string | null;
    payload: Record<string, string | number | boolean | null> | null;
  } | null
} = { job: null };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getImportJobDetailServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/import-jobs", () => ({
  getImportJobDetailServerFn: getImportJobDetailServerFnMock,
}));

const makeJobDetail = (overrides: Partial<{
  id: string;
  status: string;
  kind: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  attemptsMade: number;
  libraryRoot: { name: string } | null;
  bullmqJobId: string | null;
  error: string | null;
  payload: Record<string, string | number | boolean | null> | null;
}> = {}) => ({
  id: "job-abc-123",
  status: "SUCCEEDED",
  kind: "SCAN_LIBRARY",
  startedAt: null,
  finishedAt: null,
  createdAt: new Date().toISOString(),
  attemptsMade: 1,
  libraryRoot: null,
  bullmqJobId: null,
  error: null,
  payload: null,
  ...overrides,
});

describe("JobDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = { job: makeJobDetail() };
  });

  it("renders 'Job Detail' heading", async () => {
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.getByText("Job Detail")).toBeTruthy();
  });

  it("shows job id", async () => {
    mockLoaderData = { job: makeJobDetail({ id: "job-abc-123" }) };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.getByText("job-abc-123")).toBeTruthy();
  });

  it("shows job status badge", async () => {
    mockLoaderData = { job: makeJobDetail({ status: "SUCCEEDED" }) };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.getByText("SUCCEEDED")).toBeTruthy();
  });

  it("shows error section when job.error exists", async () => {
    mockLoaderData = {
      job: makeJobDetail({ error: "Something went wrong in the job" }),
    };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.getByText("Something went wrong in the job")).toBeTruthy();
  });

  it("does not show error section when job.error is null", async () => {
    mockLoaderData = { job: makeJobDetail({ error: null }) };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    // The Error label is in the grid above, but the pre block should not exist
    expect(screen.queryByText("Something went wrong in the job")).toBeNull();
  });

  it("shows payload section when job.payload exists", async () => {
    mockLoaderData = {
      job: makeJobDetail({ payload: { libraryRootId: "root-1" } }),
    };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.getByText(/libraryRootId/)).toBeTruthy();
  });

  it("does not show payload section when job.payload is null", async () => {
    mockLoaderData = { job: makeJobDetail({ payload: null }) };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.queryByText(/libraryRootId/)).toBeNull();
  });

  it("shows duration as '—' when no startedAt", async () => {
    mockLoaderData = { job: makeJobDetail({ startedAt: null }) };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    // Duration cell and started/finished cells all show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows duration in seconds when startedAt and finishedAt differ by seconds", async () => {
    const start = new Date(Date.now() - 5000).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      job: makeJobDetail({ startedAt: start, finishedAt: end }),
    };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    const durationEls = screen.queryAllByText(/^\d+\.\d+s$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("JobDetailSkeleton renders", async () => {
    await import("./jobs.$jobId");
    // JobDetailSkeleton is not exported - test via pendingComponent
    const { Route } = await import("./jobs.$jobId");
    const Skeleton = Route.options.pendingComponent as React.ComponentType;
    render(<Skeleton />);
    // Should render without crashing - Skeleton renders Skeleton UI elements
  });

  it("loader calls getImportJobDetailServerFn with jobId param", async () => {
    const mockJob = makeJobDetail({ id: "job-xyz" });
    getImportJobDetailServerFnMock.mockResolvedValueOnce(mockJob);
    const { Route } = await import("./jobs.$jobId");
    const loader = Route.options.loader as (args: { params: { jobId: string } }) => Promise<object>;
    const result = await loader({ params: { jobId: "job-xyz" } });
    expect(getImportJobDetailServerFnMock).toHaveBeenCalledWith({ data: { id: "job-xyz" } });
    expect(result).toEqual({ job: mockJob });
  });

  it("shows duration using Date.now() when startedAt is set but finishedAt is null", async () => {
    const start = new Date(Date.now() - 2000).toISOString();
    mockLoaderData = {
      job: makeJobDetail({ startedAt: start, finishedAt: null }),
    };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    // Should show duration in seconds (not "—")
    const durationEls = screen.queryAllByText(/^\d+\.\d+s$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("shows duration in minutes when duration >= 60s", async () => {
    const start = new Date(Date.now() - 120000).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      job: makeJobDetail({ startedAt: start, finishedAt: end }),
    };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    const durationEls = screen.queryAllByText(/m$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("shows duration in ms when duration < 1000ms", async () => {
    const start = new Date(Date.now() - 500).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      job: makeJobDetail({ startedAt: start, finishedAt: end }),
    };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    const durationEls = screen.queryAllByText(/ms$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("shows status badge with fallback 'secondary' variant for unknown status", async () => {
    mockLoaderData = { job: makeJobDetail({ status: "UNKNOWN_STATUS" }) };
    const { Route } = await import("./jobs.$jobId");
    const JobDetailPage = (Route.options.component as React.ComponentType);
    render(<JobDetailPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });
});
