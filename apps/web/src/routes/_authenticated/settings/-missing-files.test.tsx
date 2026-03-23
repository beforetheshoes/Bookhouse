// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const getMissingFilesServerFnMock = vi.fn();
const cleanupMissingFilesServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/deletion", () => ({
  getMissingFilesServerFn: getMissingFilesServerFnMock,
  cleanupMissingFilesServerFn: cleanupMissingFilesServerFnMock,
}));

const mockInvalidate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: mockInvalidate }),
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

let mockLoaderData: {
  missingFiles: {
    items: {
      id: string;
      relativePath: string;
      mediaKind: string;
      lastSeenAt: string | null;
      editionFiles: { edition: { id: string; formatFamily: string; work: { id: string; titleDisplay: string } } }[];
    }[];
    total: number;
  };
} = { missingFiles: { items: [], total: 0 } };

describe("MissingFilesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = { missingFiles: { items: [], total: 0 } };
  });

  it("renders heading and description", async () => {
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Missing Files")).toBeTruthy();
    expect(screen.getByText(/not found during the last scan/)).toBeTruthy();
  });

  it("shows empty state when no missing files", async () => {
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No missing files found.")).toBeTruthy();
  });

  it("renders table with missing files", async () => {
    mockLoaderData = {
      missingFiles: {
        items: [
          {
            id: "fa-1",
            relativePath: "books/gone.epub",
            mediaKind: "EPUB",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
            editionFiles: [{ edition: { id: "ed-1", formatFamily: "EBOOK", work: { id: "w-1", titleDisplay: "Gone Book" } } }],
          },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("books/gone.epub")).toBeTruthy();
    expect(screen.getByText("Gone Book")).toBeTruthy();
    expect(screen.getByText("EPUB")).toBeTruthy();
  });

  it("shows Clean Up All button when files exist", async () => {
    mockLoaderData = {
      missingFiles: {
        items: [
          { id: "fa-1", relativePath: "a.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Clean Up All")).toBeTruthy();
  });

  it("shows Clean Up Selected button after selecting a file", async () => {
    mockLoaderData = {
      missingFiles: {
        items: [
          { id: "fa-1", relativePath: "a.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1]; // 0 = select-all, 1 = row
    if (!rowCheckbox) throw new Error("expected checkbox");
    fireEvent.click(rowCheckbox);

    expect(screen.getByText(/Clean Up Selected/)).toBeTruthy();
  });

  it("calls cleanupMissingFilesServerFn when confirming cleanup", async () => {
    cleanupMissingFilesServerFnMock.mockResolvedValue({ deletedEditionFileCount: 1, deletedEditionIds: [], deletedWorkIds: [] });
    mockLoaderData = {
      missingFiles: {
        items: [
          { id: "fa-1", relativePath: "a.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    // Click Clean Up All
    fireEvent.click(screen.getByText("Clean Up All"));

    // Confirm dialog
    expect(screen.getByText(/will remove all missing files/)).toBeTruthy();
    const cleanUpButtons = screen.getAllByText("Clean Up All");
    fireEvent.click(cleanUpButtons[cleanUpButtons.length - 1] as HTMLElement);

    await waitFor(() => {
      expect(cleanupMissingFilesServerFnMock).toHaveBeenCalledWith({
        data: { fileAssetIds: ["fa-1"] },
      });
      expect(mockToast.success).toHaveBeenCalled();
    });
  });

  it("shows error toast when cleanup fails", async () => {
    cleanupMissingFilesServerFnMock.mockRejectedValue(new Error("Cleanup failed"));
    mockLoaderData = {
      missingFiles: {
        items: [
          { id: "fa-1", relativePath: "a.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    fireEvent.click(screen.getByText("Clean Up All"));
    const cleanUpButtons = screen.getAllByText("Clean Up All");
    fireEvent.click(cleanUpButtons[cleanUpButtons.length - 1] as HTMLElement);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Cleanup failed");
    });
  });

  it("renders back link to libraries settings", async () => {
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const backLink = screen.getByText("Back to Libraries");
    expect(backLink.closest("a")?.getAttribute("href")).toBe("/settings/libraries");
  });

  it("select-all toggles all checkboxes", async () => {
    mockLoaderData = {
      missingFiles: {
        items: [
          { id: "fa-1", relativePath: "a.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
          { id: "fa-2", relativePath: "b.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
        ],
        total: 2,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    // Click select-all
    const selectAll = screen.getByLabelText("Select all");
    fireEvent.click(selectAll);

    expect(screen.getByText(/Clean Up Selected \(2\)/)).toBeTruthy();

    // Click again to deselect
    fireEvent.click(selectAll);
    expect(screen.queryByText(/Clean Up Selected/)).toBeNull();
  });
});
