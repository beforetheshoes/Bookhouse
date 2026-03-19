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
    scanProgress: { status: string; totalFiles: number | null; processedFiles: number | null; errorCount: number | null } | null;
    issueCount: number;
  }[]
} = { roots: [] };

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

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

const makeRoot = (overrides: Partial<{
  id: string;
  name: string;
  path: string;
  kind: string;
  scanMode: string;
  isEnabled: boolean;
  lastScannedAt: string | null;
  scanProgress: { status: string; totalFiles: number | null; processedFiles: number | null; errorCount: number | null } | null;
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

describe("LibrariesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { roots: [] };
  });

  it("renders 'Library Roots' heading", async () => {
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("Library Roots")).toBeTruthy();
  });

  it("shows empty state when roots is empty", async () => {
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("No library roots configured. Add one to get started.")).toBeTruthy();
  });

  it("renders library root cards when roots present", async () => {
    mockLoaderData = { roots: [makeRoot({ name: "My Books" })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("My Books")).toBeTruthy();
    expect(screen.getByText("/home/books")).toBeTruthy();
  });

  it("shows 'Disabled' badge when root.isEnabled is false", async () => {
    mockLoaderData = { roots: [makeRoot({ isEnabled: false })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("Disabled")).toBeTruthy();
  });

  it("does not show 'Disabled' badge when root.isEnabled is true", async () => {
    mockLoaderData = { roots: [makeRoot({ isEnabled: true })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.queryByText("Disabled")).toBeNull();
  });

  it("shows 'Never' when lastScannedAt is null", async () => {
    mockLoaderData = { roots: [makeRoot({ lastScannedAt: null })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("Never")).toBeTruthy();
  });

  it("shows formatted date when lastScannedAt is set", async () => {
    const scannedAt = new Date("2024-01-15T10:30:00.000Z").toISOString();
    mockLoaderData = { roots: [makeRoot({ lastScannedAt: scannedAt })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    // The date is formatted via toLocaleString(), not "Never"
    expect(screen.queryByText("Never")).toBeNull();
  });

  it("scan button calls scanLibraryRootServerFn", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { roots: [makeRoot()] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    const scanBtn = screen.getByText("Scan Now");
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(scanLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: { libraryRootId: "root-1" },
      });
    });
  });

  it("scan button shows success toast on success", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        `Scan started for "My Library"`,
        expect.any(Object)
      );
    });
  });

  it("delete button opens confirmation dialog", async () => {
    mockLoaderData = { roots: [makeRoot()] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    // The delete button has a Trash2 icon - find by aria or role
    // There are two buttons: "Scan Now" and the trash button
    const buttons = screen.getAllByRole("button");
    // Trash button is second
    const trashBtn = buttons.find((b) => !b.textContent.includes("Scan") && !b.textContent.includes("Add"));
    if (!trashBtn) throw new Error("trash button not found");
    fireEvent.click(trashBtn);

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });
  });

  it("handleDelete calls removeLibraryRootServerFn", async () => {
    removeLibraryRootServerFnMock.mockResolvedValue(undefined);
    mockLoaderData = { roots: [makeRoot()] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    // Open delete dialog
    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find((b) => !b.textContent.includes("Scan") && !b.textContent.includes("Add"));
    if (!trashBtn) throw new Error("trash button not found");
    fireEvent.click(trashBtn);

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

  it("LibrariesSkeleton renders", async () => {
    const { Route } = await import("./libraries");
    const LibrariesSkeleton = Route.options.pendingComponent as React.ComponentType;
    render(<LibrariesSkeleton />);
    // Skeleton renders without crashing
  });

  it("scan button shows error toast when scanLibraryRootServerFn rejects with Error", async () => {
    scanLibraryRootServerFnMock.mockRejectedValue(new Error("Scan failed"));
    mockLoaderData = { roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Scan failed");
    });
  });

  it("scan button shows generic error toast when scanLibraryRootServerFn rejects with non-Error", async () => {
    scanLibraryRootServerFnMock.mockRejectedValue("not an error object");
    mockLoaderData = { roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to start scan");
    });
  });

  it("handleDelete shows error toast when removeLibraryRootServerFn rejects with Error", async () => {
    removeLibraryRootServerFnMock.mockRejectedValue(new Error("Delete failed"));
    mockLoaderData = { roots: [makeRoot()] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    // Open delete dialog
    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find((b) => !b.textContent.includes("Scan") && !b.textContent.includes("Add"));
    if (!trashBtn) throw new Error("trash button not found");
    fireEvent.click(trashBtn);

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
    mockLoaderData = { roots: [makeRoot()] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    // Open delete dialog
    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find((b) => !b.textContent.includes("Scan") && !b.textContent.includes("Add"));
    if (!trashBtn) throw new Error("trash button not found");
    fireEvent.click(trashBtn);

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
    mockLoaderData = { roots: [makeRoot({ name: "Removed Library" })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    // Open delete dialog
    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find((b) => !b.textContent.includes("Scan") && !b.textContent.includes("Add"));
    if (!trashBtn) throw new Error("trash button not found");
    fireEvent.click(trashBtn);

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

  it("loader calls getLibraryRootsServerFn with progress and issue count per root", async () => {
    const mockRoots = [{ id: "root-1", name: "Loader Root", path: "/books", kind: "EBOOKS", scanMode: "INCREMENTAL", isEnabled: true, lastScannedAt: null }];
    getLibraryRootsServerFnMock.mockResolvedValueOnce(mockRoots);
    getScanProgressServerFnMock.mockResolvedValueOnce(null);
    getLibraryIssueCountServerFnMock.mockResolvedValueOnce(0);
    const { Route } = await import("./libraries");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getLibraryRootsServerFnMock).toHaveBeenCalled();
    expect(getScanProgressServerFnMock).toHaveBeenCalledWith({ data: { libraryRootId: "root-1" } });
    expect(getLibraryIssueCountServerFnMock).toHaveBeenCalledWith({ data: { libraryRootId: "root-1" } });
    expect(result).toEqual({ roots: [{ ...mockRoots[0], scanProgress: null, issueCount: 0 }] });
  });

  it("cancel button in delete dialog closes the dialog", async () => {
    mockLoaderData = { roots: [makeRoot()] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    // Open delete dialog
    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find((b) => !b.textContent.includes("Scan") && !b.textContent.includes("Add"));
    if (!trashBtn) throw new Error("trash button not found");
    fireEvent.click(trashBtn);

    await waitFor(() => {
      expect(screen.getByText("Remove Library Root")).toBeTruthy();
    });

    // Click Cancel button
    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    // Dialog should close - "Remove Library Root" title should no longer be visible
    await waitFor(() => {
      expect(screen.queryByText("Remove Library Root")).toBeNull();
    });
  });

  it("shows progress bar when scan is active", async () => {
    mockLoaderData = {
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 100, processedFiles: 42, errorCount: 2 },
      })],
    };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("Scanning... 42 / 100 files (2 errors)")).toBeTruthy();
  });

  it("does not show progress bar when no active scan", async () => {
    mockLoaderData = { roots: [makeRoot({ scanProgress: null })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows issue count badge linking to issues page", async () => {
    mockLoaderData = { roots: [makeRoot({ issueCount: 3 })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    const issueLink = screen.getByText("3 issues");
    expect(issueLink).toBeTruthy();
    expect(issueLink.closest("a")?.getAttribute("href")).toBe("/settings/library-issues/root-1");
  });

  it("shows singular 'issue' when count is 1", async () => {
    mockLoaderData = { roots: [makeRoot({ issueCount: 1 })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("1 issue")).toBeTruthy();
  });

  it("does not show issue badge when count is 0", async () => {
    mockLoaderData = { roots: [makeRoot({ issueCount: 0 })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.queryByText("0 issues")).toBeNull();
  });

  it("shows progress with null processedFiles and totalFiles", async () => {
    mockLoaderData = {
      roots: [makeRoot({
        scanProgress: { status: "QUEUED", totalFiles: null, processedFiles: null, errorCount: null },
      })],
    };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("Scanning... 0 / ? files")).toBeTruthy();
  });

  it("shows progress without error count when errorCount is 0", async () => {
    mockLoaderData = {
      roots: [makeRoot({
        scanProgress: { status: "RUNNING", totalFiles: 50, processedFiles: 10, errorCount: 0 },
      })],
    };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);
    expect(screen.getByText("Scanning... 10 / 50 files")).toBeTruthy();
  });

  it("toast success action navigates to job detail", async () => {
    scanLibraryRootServerFnMock.mockResolvedValue({ importJobId: "job-123" });
    mockLoaderData = { roots: [makeRoot({ name: "My Library" })] };
    const { Route } = await import("./libraries");
    const LibrariesPage = (Route.options.component as React.ComponentType);
    render(<LibrariesPage />);

    fireEvent.click(screen.getByText("Scan Now"));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
    });

    // Verify that the toast action onClick navigates correctly
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
});
