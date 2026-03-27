// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  roots: {
    id: string;
    name: string;
    path: string;
    kind: string;
    scanMode: string;
    isEnabled: boolean;
    lastScannedAt: string | null;
    scanProgress: { status: string; totalFiles: number | null; processedFiles: number | null; errorCount: number | null; stale: boolean; scanStage: string | null } | null;
    issueCount: number;
  }[];
  missingFileBehavior?: string;
  jobs: {
    id: string;
    status: string;
    kind: string;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    attemptsMade: number;
    libraryRoot: { name: string } | null;
  }[];
  totalCount: number;
  concurrencies: { full: number; onDemand: number; incremental: number };
  integrations: Record<string, { configured: boolean; label: string }>;
} = { roots: [], missingFileBehavior: "manual", jobs: [], totalCount: 0, concurrencies: { full: 8, onDemand: 5, incremental: 3 }, integrations: { openlibrary: { configured: true, label: "Open Library" }, googlebooks: { configured: false, label: "Google Books" }, hardcover: { configured: false, label: "Hardcover" } } };

const getLibraryRootsServerFnMock = vi.fn();
const scanLibraryRootServerFnMock = vi.fn();
const removeLibraryRootServerFnMock = vi.fn();

const getScanProgressServerFnMock = vi.fn();
const getLibraryIssueCountServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/library-roots", () => ({
  getLibraryRootsServerFn: getLibraryRootsServerFnMock,
  getScanProgressServerFn: getScanProgressServerFnMock,
  getLibraryIssueCountServerFn: getLibraryIssueCountServerFnMock,
  scanLibraryRootServerFn: scanLibraryRootServerFnMock,
  removeLibraryRootServerFn: removeLibraryRootServerFnMock,
  addLibraryRootServerFn: vi.fn(),
}));

const getMissingFileBehaviorServerFnMock = vi.fn();
const setMissingFileBehaviorServerFnMock = vi.fn();
const getImportJobsServerFnMock = vi.fn();
const stopAllJobsServerFnMock = vi.fn().mockResolvedValue({ stoppedCount: 0 });
const getAllScanConcurrenciesServerFnMock = vi.fn().mockResolvedValue({ full: 8, onDemand: 5, incremental: 3 });
const setScanConcurrencyServerFnMock = vi.fn().mockResolvedValue({ scanType: "full", concurrency: 8 });

vi.mock("~/lib/server-fns/app-settings", () => ({
  getMissingFileBehaviorServerFn: getMissingFileBehaviorServerFnMock,
  setMissingFileBehaviorServerFn: setMissingFileBehaviorServerFnMock,
  getAllScanConcurrenciesServerFn: getAllScanConcurrenciesServerFnMock,
  setScanConcurrencyServerFn: setScanConcurrencyServerFnMock,
}));

vi.mock("~/lib/server-fns/integrations", () => ({
  getIntegrationStatusServerFn: vi.fn().mockResolvedValue({
    openlibrary: { configured: true, label: "Open Library" },
    googlebooks: { configured: false, label: "Google Books" },
    hardcover: { configured: false, label: "Hardcover" },
  }),
  validateApiKeyServerFn: vi.fn().mockResolvedValue({ valid: true }),
  setApiKeyServerFn: vi.fn().mockResolvedValue({ provider: "googlebooks" }),
  removeApiKeyServerFn: vi.fn().mockResolvedValue({ provider: "googlebooks" }),
}));

vi.mock("~/lib/server-fns/import-jobs", () => ({
  getImportJobsServerFn: getImportJobsServerFnMock,
  stopAllJobsServerFn: stopAllJobsServerFnMock,
}));

vi.mock("~/lib/mutation", () => ({
  runMutation: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

const mockSetTheme = vi.fn();
let mockTheme = "system";

vi.mock("~/hooks/use-theme", () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}));

const mockSetColorMode = vi.fn();
const mockSetAccentColor = vi.fn();
let mockColorMode = "book";
let mockAccentColor: string | null = null;

vi.mock("~/hooks/use-app-color", () => ({
  useAppColor: () => ({
    colorMode: mockColorMode,
    setColorMode: mockSetColorMode,
    accentColor: mockAccentColor,
    setAccentColor: mockSetAccentColor,
    setBookColors: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
const mockInvalidate = vi.fn();

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
    useRouter: () => ({ invalidate: mockInvalidate, navigate: mockNavigate }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

vi.mock("~/hooks/use-sse", () => ({ useSSE: vi.fn() }));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

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

const makeRoot = (overrides: Partial<{
  id: string;
  name: string;
  path: string;
  kind: string;
  scanMode: string;
  isEnabled: boolean;
  lastScannedAt: string | null;
  scanProgress: { status: string; totalFiles: number | null; processedFiles: number | null; errorCount: number | null; stale: boolean; scanStage: string | null } | null;
  issueCount: number;
}> = {}) => ({
  id: "root-1",
  name: "My Library",
  path: "/home/books",
  kind: "EBOOKS",
  scanMode: "INCREMENTAL",
  isEnabled: true,
  lastScannedAt: null,
  scanProgress: null,
  issueCount: 0,
  ...overrides,
});

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

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { roots: [], missingFileBehavior: "manual", jobs: [], totalCount: 0, concurrencies: { full: 8, onDemand: 5, incremental: 3 }, integrations: { openlibrary: { configured: true, label: "Open Library" }, googlebooks: { configured: false, label: "Google Books" }, hardcover: { configured: false, label: "Hardcover" } } };
    mockTheme = "system";
    mockColorMode = "book";
    mockAccentColor = null;
  });

  it("renders 'Settings' heading", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("renders three tabs: Library, Appearance, Jobs", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: "Library" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Jobs" })).toBeTruthy();
  });

  it("Library tab is selected by default", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: "Library" }).getAttribute("data-state")).toBe("active");
  });

  it("shows empty state when roots is empty", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("No library roots configured. Add one to get started.")).toBeTruthy();
  });

  it("renders library root cards when roots present", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ name: "My Books" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("My Books")).toBeTruthy();
    expect(screen.getByText("/home/books")).toBeTruthy();
  });

  it("shows 'Disabled' badge when root.isEnabled is false", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ isEnabled: false })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Disabled")).toBeTruthy();
  });

  it("does not show 'Disabled' badge when root.isEnabled is true", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ isEnabled: true })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByText("Disabled")).toBeNull();
  });

  it("shows 'Never' when lastScannedAt is null", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ lastScannedAt: null })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Never")).toBeTruthy();
  });

  it("shows formatted date when lastScannedAt is set", async () => {
    const scannedAt = new Date("2024-01-15T10:30:00.000Z").toISOString();
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ lastScannedAt: scannedAt })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByText("Never")).toBeNull();
  });

  it("scan button calls scanLibraryRootServerFn with the root default scan mode", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot()] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const scanBtn = screen.getByText("Scan Now");
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(scanLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: { libraryRootId: "root-1", scanMode: "INCREMENTAL" },
      });
    });
  });

  it("full scan button triggers a one-off FULL scan", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ scanMode: "INCREMENTAL" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Full Scan"));

    await waitFor(() => {
      expect(scanLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: { libraryRootId: "root-1", scanMode: "FULL" },
      });
    });
  });

  it("full scan button shows a starting state while the request is in flight", async () => {
    let resolveScan!: (value: { importJobId: string }) => void;
    scanLibraryRootServerFnMock.mockReturnValue(
      new Promise<{ importJobId: string }>((resolve) => {
        resolveScan = resolve;
      }),
    );
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ scanMode: "INCREMENTAL" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const fullScanButton = screen.getByRole("button", { name: "Full Scan" });
    fireEvent.click(fullScanButton);

    await waitFor(() => {
      expect(fullScanButton.textContent).toContain("Starting...");
    });

    resolveScan({ importJobId: "job-123" });

    await waitFor(() => {
      expect(fullScanButton.textContent).toContain("Full Scan");
    });
  });

  it("scan button shows success toast on success", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        `Scan started for "My Library"`,
        expect.any(Object)
      );
    });
  });

  it("delete button opens confirmation dialog", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot()] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });
  });

  it("handleDelete calls removeLibraryRootServerFn", async () => {
    removeLibraryRootServerFnMock.mockResolvedValue(undefined);
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot()] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });

    const removeBtn = screen.getByText("Remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(removeLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: { id: "root-1" },
      });
    });
  });

  it("SettingsSkeleton renders", async () => {
    const { Route } = await import("./index");
    const SettingsSkeleton = Route.options.pendingComponent as React.ComponentType;
    render(<SettingsSkeleton />);
  });

  it("scan button shows error toast when scanLibraryRootServerFn rejects with Error", async () => {
    scanLibraryRootServerFnMock.mockRejectedValue(new Error("Scan failed"));
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Scan failed");
    });
  });

  it("scan button shows generic error toast when scanLibraryRootServerFn rejects with non-Error", async () => {
    scanLibraryRootServerFnMock.mockRejectedValue("not an error object");
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to start scan");
    });
  });

  it("handleDelete shows error toast when removeLibraryRootServerFn rejects with Error", async () => {
    removeLibraryRootServerFnMock.mockRejectedValue(new Error("Delete failed"));
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot()] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });

    const removeBtn = screen.getByText("Remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Delete failed");
    });
  });

  it("handleDelete shows generic error toast when removeLibraryRootServerFn rejects with non-Error", async () => {
    removeLibraryRootServerFnMock.mockRejectedValue("not an error");
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot()] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });

    const removeBtn = screen.getByText("Remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to remove library root");
    });
  });

  it("handleDelete shows success toast and invalidates router after removal", async () => {
    removeLibraryRootServerFnMock.mockResolvedValue(undefined);
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ name: "Removed Library" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });

    const removeBtn = screen.getByText("Remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(`"Removed Library" removed`);
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  it("loader calls all server functions including jobs and concurrency", async () => {
    const mockRoots = [{ id: "root-1", name: "Loader Root", path: "/books", kind: "EBOOKS", scanMode: "INCREMENTAL", isEnabled: true, lastScannedAt: null }];
    getLibraryRootsServerFnMock.mockResolvedValueOnce(mockRoots);
    getMissingFileBehaviorServerFnMock.mockResolvedValueOnce("manual");
    getImportJobsServerFnMock.mockResolvedValueOnce({ jobs: [], totalCount: 0 });
    getAllScanConcurrenciesServerFnMock.mockResolvedValueOnce({ full: 8, onDemand: 5, incremental: 3 });
    getScanProgressServerFnMock.mockResolvedValueOnce(null);
    getLibraryIssueCountServerFnMock.mockResolvedValueOnce(0);
    const { Route } = await import("./index");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getLibraryRootsServerFnMock).toHaveBeenCalled();
    expect(getImportJobsServerFnMock).toHaveBeenCalledWith({ data: { page: 1, pageSize: 100 } });
    expect(getAllScanConcurrenciesServerFnMock).toHaveBeenCalled();
    expect(getScanProgressServerFnMock).toHaveBeenCalledWith({ data: { libraryRootId: "root-1" } });
    expect(getLibraryIssueCountServerFnMock).toHaveBeenCalledWith({ data: { libraryRootId: "root-1" } });
    expect(result).toEqual({
      roots: [{ ...mockRoots[0], scanProgress: null, issueCount: 0 }],
      missingFileBehavior: "manual",
      jobs: [],
      totalCount: 0,
      concurrencies: { full: 8, onDemand: 5, incremental: 3 },
      integrations: {
        openlibrary: { configured: true, label: "Open Library" },
        googlebooks: { configured: false, label: "Google Books" },
        hardcover: { configured: false, label: "Hardcover" },
      },
    });
  });

  it("cancel button in delete dialog closes the dialog", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot()] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText("Remove Library Root")).toBeNull();
    });
  });

  it("shows progress bar with discovery text during DISCOVERY stage", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 100, processedFiles: 42, errorCount: 2, stale: false, scanStage: "DISCOVERY" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText(/Discovering files/)).toBeTruthy();
  });

  it("does not show progress bar when no active scan", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ scanProgress: null })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows issue count badge linking to issues page", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ issueCount: 3 })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const issueLink = screen.getByText("3 issues");
    expect(issueLink).toBeTruthy();
    expect(issueLink.closest("a")?.getAttribute("href")).toBe("/settings/library-issues/root-1");
  });

  it("shows singular 'issue' when count is 1", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ issueCount: 1 })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("1 issue")).toBeTruthy();
  });

  it("does not show issue badge when count is 0", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ issueCount: 0 })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByText("0 issues")).toBeNull();
  });

  it("shows progress with null processedFiles and totalFiles during DISCOVERY", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "QUEUED", totalFiles: null, processedFiles: null, errorCount: null, stale: false, scanStage: "DISCOVERY" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText(/Discovering files/)).toBeTruthy();
  });

  it("shows spinner-only messaging during PROCESSING stage", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 50, processedFiles: 50, errorCount: 0, stale: false, scanStage: "PROCESSING" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(/Processing library/)).toBeTruthy();
  });

  it("shows persistent note during any active scan", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 100, processedFiles: 42, errorCount: 0, stale: false, scanStage: "DISCOVERY" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText(/Books may appear incomplete/)).toBeTruthy();
  });

  it("does not show persistent note when no scan is active", async () => {
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ scanProgress: null })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByText(/Books may appear incomplete/)).toBeNull();
  });

  it("shows stalled warning when scan is stale", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 500, processedFiles: 200, errorCount: 0, stale: true, scanStage: "PROCESSING" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Scan Stalled")).toBeTruthy();
    expect(screen.getByText(/Scan appears stalled/)).toBeTruthy();
  });

  it("shows stalled warning progress even when processedFiles and totalFiles are null", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: null, processedFiles: null, errorCount: 0, stale: true, scanStage: "PROCESSING" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText(/Scan appears stalled/)).toBeTruthy();
  });

  it("shows normal scanning state when scan is not stale", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 100, processedFiles: 42, errorCount: 0, stale: false, scanStage: "DISCOVERY" },
      })],
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText(/Discovering files/)).toBeTruthy();
    expect(screen.queryByText("Scan Stalled")).toBeNull();
    expect(screen.queryByText(/Scan appears stalled/)).toBeNull();
  });

  it("toast success action navigates to job detail", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { ...mockLoaderData, roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
    });

    const toastCall = mockToast.success.mock.calls[0];
    expect(toastCall).toBeDefined();
    const options = toastCall?.[1] as { action: { onClick: () => void } } | undefined;
    expect(options).toBeDefined();
    options?.action.onClick();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/jobs/$jobId",
      params: { jobId: "job-123" },
    });
  });

  it("renders Missing File Behavior setting card", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Missing File Behavior")).toBeTruthy();
  });

  it("renders auto-cleanup option when missingFileBehavior is auto-cleanup", async () => {
    mockLoaderData = { ...mockLoaderData, missingFileBehavior: "auto-cleanup" };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Missing File Behavior")).toBeTruthy();
  });

  it("calls setMissingFileBehaviorServerFn when changing to auto-cleanup", async () => {
    setMissingFileBehaviorServerFnMock.mockResolvedValue({ behavior: "auto-cleanup" });
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const autoCleanupRadio = screen.getByDisplayValue("auto-cleanup");
    fireEvent.click(autoCleanupRadio);

    await waitFor(() => {
      expect(setMissingFileBehaviorServerFnMock).toHaveBeenCalledWith({
        data: { behavior: "auto-cleanup" },
      });
    });
  });

  it("calls setMissingFileBehaviorServerFn when changing to manual", async () => {
    setMissingFileBehaviorServerFnMock.mockResolvedValue({ behavior: "manual" });
    mockLoaderData = { ...mockLoaderData, missingFileBehavior: "auto-cleanup" };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const manualRadio = screen.getByDisplayValue("manual");
    fireEvent.click(manualRadio);

    await waitFor(() => {
      expect(setMissingFileBehaviorServerFnMock).toHaveBeenCalledWith({
        data: { behavior: "manual" },
      });
    });
  });

  it("shows error toast when setting update fails", async () => {
    setMissingFileBehaviorServerFnMock.mockRejectedValue(new Error("fail"));
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const autoCleanupRadio = screen.getByDisplayValue("auto-cleanup");
    fireEvent.click(autoCleanupRadio);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to update setting");
    });
  });
});

describe("AppearanceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { roots: [], missingFileBehavior: "manual", jobs: [], totalCount: 0, concurrencies: { full: 8, onDemand: 5, incremental: 3 }, integrations: { openlibrary: { configured: true, label: "Open Library" }, googlebooks: { configured: false, label: "Google Books" }, hardcover: { configured: false, label: "Hardcover" } } };
    mockTheme = "system";
    mockColorMode = "book";
    mockAccentColor = null;
  });

  it("renders the Theme card", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Theme")).toBeTruthy();
  });

  it("renders three theme toggle buttons", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("radio", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "System" })).toBeTruthy();
  });

  it("system option is checked when theme is system", async () => {
    mockTheme = "system";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
  });

  it("dark option is checked when theme is dark", async () => {
    mockTheme = "dark";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  });

  it("calls setTheme when clicking dark option", async () => {
    mockTheme = "light";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme when clicking light option", async () => {
    mockTheme = "dark";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("calls setTheme when clicking system option", async () => {
    mockTheme = "dark";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });
});

describe("ColorCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { roots: [], missingFileBehavior: "manual", jobs: [], totalCount: 0, concurrencies: { full: 8, onDemand: 5, incremental: 3 }, integrations: { openlibrary: { configured: true, label: "Open Library" }, googlebooks: { configured: false, label: "Google Books" }, hardcover: { configured: false, label: "Hardcover" } } };
    mockTheme = "system";
    mockColorMode = "book";
    mockAccentColor = null;
  });

  it("renders the Color card", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Color")).toBeTruthy();
  });

  it("renders four color mode radio options", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByDisplayValue("off")).toBeTruthy();
    expect(screen.getByDisplayValue("book")).toBeTruthy();
    expect(screen.getByDisplayValue("page")).toBeTruthy();
    expect(screen.getByDisplayValue("accent")).toBeTruthy();
  });

  it("book radio is checked when colorMode is book", async () => {
    mockColorMode = "book";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const bookRadio = screen.getByDisplayValue("book");
    expect((bookRadio as HTMLInputElement).checked).toBe(true);
  });

  it("calls setColorMode when clicking a different color mode", async () => {
    mockColorMode = "book";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    fireEvent.click(screen.getByDisplayValue("off"));
    expect(mockSetColorMode).toHaveBeenCalledWith("off");
  });

  it("shows hex input when colorMode is accent", async () => {
    mockColorMode = "accent";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByPlaceholderText("#3366cc")).toBeTruthy();
  });

  it("does not show hex input when colorMode is not accent", async () => {
    mockColorMode = "book";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.queryByPlaceholderText("#3366cc")).toBeNull();
  });

  it("calls setAccentColor on blur with valid hex", async () => {
    mockColorMode = "accent";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const input = screen.getByPlaceholderText("#3366cc");
    fireEvent.change(input, { target: { value: "#ff0000" } });
    fireEvent.blur(input);
    expect(mockSetAccentColor).toHaveBeenCalledWith("#ff0000");
  });

  it("does not call setAccentColor on blur with invalid hex", async () => {
    mockColorMode = "accent";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const input = screen.getByPlaceholderText("#3366cc");
    fireEvent.change(input, { target: { value: "not-a-hex" } });
    fireEvent.blur(input);
    expect(mockSetAccentColor).not.toHaveBeenCalled();
  });

  it("does not call setAccentColor for 3-char shorthand hex '#f00'", async () => {
    mockColorMode = "accent";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const input = screen.getByPlaceholderText("#3366cc");
    fireEvent.change(input, { target: { value: "#f00" } });
    fireEvent.blur(input);
    // Regex requires exactly 6 hex digits, so 3-char shorthand is rejected
    expect(mockSetAccentColor).not.toHaveBeenCalled();
  });

  it("calls setColorMode with 'book' when switching from accent to book", async () => {
    mockColorMode = "accent";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    // Hex input visible in accent mode
    expect(screen.getByPlaceholderText("#3366cc")).toBeTruthy();

    // Click book radio
    fireEvent.click(screen.getByDisplayValue("book"));
    expect(mockSetColorMode).toHaveBeenCalledWith("book");
  });

  it("uses existing accentColor as initial hex input value", async () => {
    mockColorMode = "accent";
    mockAccentColor = "#aabbcc";
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const input = screen.getByPlaceholderText("#3366cc");
    expect((input as HTMLInputElement).value).toBe("#aabbcc");
  });
});

describe("JobsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { roots: [], missingFileBehavior: "manual", jobs: [], totalCount: 0, concurrencies: { full: 8, onDemand: 5, incremental: 3 }, integrations: { openlibrary: { configured: true, label: "Open Library" }, googlebooks: { configured: false, label: "Google Books" }, hardcover: { configured: false, label: "Hardcover" } } };
    mockTheme = "system";
    mockColorMode = "book";
    mockAccentColor = null;
  });

  it("renders jobs description", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText(/Monitor the status of library import/)).toBeTruthy();
  });

  it("shows total count when totalCount > 0", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ status: "SUCCEEDED" })],
      totalCount: 42,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("42 total jobs")).toBeTruthy();
  });

  it("shows singular 'job' when totalCount is 1", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ status: "SUCCEEDED" })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("1 total job")).toBeTruthy();
  });

  it("renders Stop All Jobs button", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Stop All Jobs")).toBeTruthy();
  });

  it("calls stopAllJobsServerFn when Stop All Jobs is clicked and confirmed", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    stopAllJobsServerFnMock.mockResolvedValueOnce({ stoppedCount: 3 });

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Stop All Jobs"));

    await waitFor(() => {
      expect(stopAllJobsServerFnMock).toHaveBeenCalled();
    });
  });

  it("does not call stopAllJobsServerFn when confirm is cancelled", async () => {
    window.confirm = vi.fn().mockReturnValue(false);
    stopAllJobsServerFnMock.mockClear();

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByText("Stop All Jobs"));

    expect(stopAllJobsServerFnMock).not.toHaveBeenCalled();
  });

  it("renders three concurrency inputs with loader values", async () => {
    mockLoaderData = { ...mockLoaderData, concurrencies: { full: 10, onDemand: 7, incremental: 2 } };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    expect(screen.getByDisplayValue("7")).toBeTruthy();
    expect(screen.getByDisplayValue("2")).toBeTruthy();
  });

  it("renders concurrency labels for each scan type", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("Full Scan:")).toBeTruthy();
    expect(screen.getByText("On-demand:")).toBeTruthy();
    expect(screen.getByText("Incremental:")).toBeTruthy();
  });

  it("shows Save button when any concurrency is changed", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const input = screen.getByDisplayValue("8");
    fireEvent.change(input, { target: { value: "12" } });
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("calls setScanConcurrencyServerFn for each changed value when Save is clicked", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    const fullInput = screen.getByDisplayValue("8");
    fireEvent.change(fullInput, { target: { value: "12" } });
    const saveBtn = screen.getByText("Save");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(setScanConcurrencyServerFnMock).toHaveBeenCalledWith({ data: { scanType: "full", concurrency: 12 } });
    });
  });

  it("renders formatDuration as '—' when no startedAt", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ startedAt: null })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders duration in ms when < 1000ms", async () => {
    const start = new Date(Date.now() - 500).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ startedAt: start, finishedAt: end })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const durationEls = screen.queryAllByText(/ms$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("renders duration in seconds when < 60s", async () => {
    const start = new Date(Date.now() - 5000).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ startedAt: start, finishedAt: end })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const durationEls = screen.queryAllByText(/^\d+\.\d+s$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("renders duration in minutes when >= 60s", async () => {
    const start = new Date(Date.now() - 120000).toISOString();
    const end = new Date(Date.now()).toISOString();
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ startedAt: start, finishedAt: end })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const durationEls = screen.queryAllByText(/m$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("renders duration using Date.now() when startedAt set but finishedAt is null", async () => {
    const start = new Date(Date.now() - 2000).toISOString();
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ startedAt: start, finishedAt: null })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const durationEls = screen.queryAllByText(/^\d+\.\d+s$/);
    expect(durationEls.length).toBeGreaterThan(0);
  });

  it("formatKind replaces underscores with spaces", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ kind: "SCAN_LIBRARY" })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("SCAN LIBRARY")).toBeTruthy();
  });

  it("renders unknown status with fallback 'secondary' variant", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [makeJob({ status: "UNKNOWN_STATUS" })],
      totalCount: 1,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("clicking 'Created' column header triggers sort (exercises accessorFn)", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      jobs: [
        makeJob({ id: "job-a", createdAt: new Date(Date.now() - 1000).toISOString() }),
        makeJob({ id: "job-b", createdAt: new Date(Date.now() - 2000).toISOString() }),
      ],
      totalCount: 2,
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);
    const createdBtn = screen.getByRole("button", { name: /created/i });
    fireEvent.click(createdBtn);
    expect(createdBtn).toBeTruthy();
  });
});

describe("Integrations Tab", () => {
  it("renders the Integrations tab trigger", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    expect(screen.getByRole("tab", { name: "Integrations" })).toBeTruthy();
  });

  it("shows all three providers with correct status", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    // Switch to integrations tab
    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    expect(screen.getByText("Open Library")).toBeTruthy();
    expect(screen.getByText("Google Books")).toBeTruthy();
    expect(screen.getByText("Hardcover")).toBeTruthy();
  });

  it("shows Connected badge for configured providers", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getAllByText("Not configured")).toHaveLength(2);
  });

  it("shows no API key required for Open Library", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    expect(screen.getByText("No API key required. Always available.")).toBeTruthy();
  });

  it("shows API key input for unconfigured providers", async () => {
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    // Google Books and Hardcover should show input fields
    const inputs = screen.getAllByPlaceholderText("Enter API key");
    expect(inputs).toHaveLength(2);
  });

  it("shows remove button for configured providers", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      integrations: {
        openlibrary: { configured: true, label: "Open Library" },
        googlebooks: { configured: true, label: "Google Books" },
        hardcover: { configured: false, label: "Hardcover" },
      },
    };
    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    expect(screen.getByText("API key configured")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("validates and saves key, then shows saved state", async () => {
    const { validateApiKeyServerFn, setApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const validateMock = validateApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    const setApiKeyMock = setApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    const inputs = screen.getAllByPlaceholderText("Enter API key");
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "test-gb-key" } });

    const saveButtons = screen.getAllByRole("button", { name: "Save Key" });
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(validateMock).toHaveBeenCalled();
      expect(setApiKeyMock).toHaveBeenCalled();
    });

    // Button should show saved state
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "✓ Saved" })).toBeTruthy();
    });
  });

  it("calls removeApiKeyServerFn when removing a key", async () => {
    mockLoaderData = {
      ...mockLoaderData,
      integrations: {
        openlibrary: { configured: true, label: "Open Library" },
        googlebooks: { configured: true, label: "Google Books" },
        hardcover: { configured: false, label: "Hardcover" },
      },
    };
    const { removeApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const removeApiKeyMock = removeApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(removeApiKeyMock).toHaveBeenCalled();
    });
  });

  it("shows validation error when API key is invalid", async () => {
    const { validateApiKeyServerFn, setApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const validateMock = validateApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    const setApiKeyMock = setApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    validateMock.mockClear();
    setApiKeyMock.mockClear();
    validateMock.mockResolvedValueOnce({ valid: false, error: "Invalid API key" });

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    const inputs = screen.getAllByPlaceholderText("Enter API key");
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "bad-key" } });

    const saveButtons = screen.getAllByRole("button", { name: "Save Key" });
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("Invalid API key")).toBeTruthy();
    });

    // Should not have called setApiKeyServerFn
    expect(setApiKeyMock).not.toHaveBeenCalled();
  });

  it("shows fallback error when validation returns no error message", async () => {
    const { validateApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const validateMock = validateApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    validateMock.mockClear();
    validateMock.mockResolvedValueOnce({ valid: false });

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    const inputs = screen.getAllByPlaceholderText("Enter API key");
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "bad-key" } });

    const saveButtons = screen.getAllByRole("button", { name: "Save Key" });
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("API key validation failed")).toBeTruthy();
    });
  });

  it("shows error when save fails after validation passes", async () => {
    const { setApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const setApiKeyMock = setApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    setApiKeyMock.mockRejectedValueOnce(new Error("Network error"));

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    const inputs = screen.getAllByPlaceholderText("Enter API key");
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "good-key" } });

    const saveButtons = screen.getAllByRole("button", { name: "Save Key" });
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("Failed to save: Network error")).toBeTruthy();
    });
  });

  it("shows Unknown error when save throws non-Error", async () => {
    const { setApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const setApiKeyMock = setApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    setApiKeyMock.mockRejectedValueOnce("string error");

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    const inputs = screen.getAllByPlaceholderText("Enter API key");
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "some-key" } });

    const saveButtons = screen.getAllByRole("button", { name: "Save Key" });
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("Failed to save: Unknown error")).toBeTruthy();
    });
  });

  it("shows error toast when removing API key fails", async () => {
    mockToast.error.mockClear();
    mockLoaderData = {
      ...mockLoaderData,
      integrations: {
        openlibrary: { configured: true, label: "Open Library" },
        googlebooks: { configured: true, label: "Google Books" },
        hardcover: { configured: false, label: "Hardcover" },
      },
    };
    const { removeApiKeyServerFn } = await import("~/lib/server-fns/integrations");
    const removeApiKeyMock = removeApiKeyServerFn as unknown as ReturnType<typeof vi.fn>;
    removeApiKeyMock.mockRejectedValueOnce(new Error("Network error"));

    const { Route } = await import("./index");
    const SettingsPage = (Route.options.component as React.ComponentType);
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Integrations" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to remove API key");
    });
  });
});
