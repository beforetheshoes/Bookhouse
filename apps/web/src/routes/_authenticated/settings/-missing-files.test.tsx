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

  it("shows plural records text in success toast when cleanup removes multiple records", async () => {
    cleanupMissingFilesServerFnMock.mockResolvedValue({ deletedEditionFileCount: 2, deletedEditionIds: ["ed-1"], deletedWorkIds: ["w-1"] });
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
      expect(mockToast.success).toHaveBeenCalledWith("Cleaned up 4 records");
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

  it("deselects individual file when checkbox is clicked again", async () => {
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

    // Select
    fireEvent.click(rowCheckbox);
    expect(screen.getByText(/Clean Up Selected/)).toBeTruthy();

    // Deselect
    fireEvent.click(rowCheckbox);
    expect(screen.queryByText(/Clean Up Selected/)).toBeNull();
  });

  it("opens cleanup selected dialog and confirms cleanup for selected files", async () => {
    cleanupMissingFilesServerFnMock.mockResolvedValue({ deletedEditionFileCount: 1, deletedEditionIds: [], deletedWorkIds: [] });
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

    // Select first file
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected checkbox");
    fireEvent.click(rowCheckbox);

    // Click "Clean Up Selected (1)"
    fireEvent.click(screen.getByText(/Clean Up Selected/));

    // Verify dialog content
    expect(screen.getByText(/will remove the selected missing files/)).toBeTruthy();

    // Confirm
    const cleanUpBtn = screen.getByRole("button", { name: "Clean Up" });
    fireEvent.click(cleanUpBtn);

    await waitFor(() => {
      expect(cleanupMissingFilesServerFnMock).toHaveBeenCalledWith({
        data: { fileAssetIds: ["fa-1"] },
      });
      expect(mockToast.success).toHaveBeenCalled();
    });
  });

  it("closes cleanup selected dialog when cancel is clicked", async () => {
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

    // Select file
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected checkbox");
    fireEvent.click(rowCheckbox);

    // Open cleanup dialog
    fireEvent.click(screen.getByText(/Clean Up Selected/));
    expect(screen.getByText(/will remove the selected missing files/)).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));
  });

  it("closes clean all dialog when cancel is clicked", async () => {
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

    // Open clean all dialog
    fireEvent.click(screen.getByText("Clean Up All"));
    expect(screen.getByText(/will remove all missing files/)).toBeTruthy();

    // Click Cancel
    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[cancelButtons.length - 1] as HTMLElement);
  });

  it("shows dash when file has no linked edition", async () => {
    mockLoaderData = {
      missingFiles: {
        items: [
          { id: "fa-1", relativePath: "orphan.epub", mediaKind: "EPUB", lastSeenAt: null, editionFiles: [] },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("orphan.epub")).toBeTruthy();
    // The work column should show "—" for files with no edition
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows dash when lastSeenAt is null", async () => {
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
    // "—" appears for both the work column and lastSeenAt
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows formatted date when lastSeenAt is provided", async () => {
    mockLoaderData = {
      missingFiles: {
        items: [
          {
            id: "fa-1",
            relativePath: "a.epub",
            mediaKind: "EPUB",
            lastSeenAt: "2025-06-15T00:00:00.000Z",
            editionFiles: [{ edition: { id: "ed-1", formatFamily: "EBOOK", work: { id: "w-1", titleDisplay: "A Book" } } }],
          },
        ],
        total: 1,
      },
    };
    const { Route } = await import("./missing-files");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // Should render the date (format depends on locale but should not be "—")
    const cells = screen.getAllByRole("cell");
    const lastSeenCell = cells[cells.length - 1];
    expect(lastSeenCell?.textContent).not.toBe("—");
  });

  it("shows singular text for cleanup of 1 file", async () => {
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

    // Select the file
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected checkbox");
    fireEvent.click(rowCheckbox);

    // Open cleanup dialog
    fireEvent.click(screen.getByText(/Clean Up Selected/));

    // Should show singular "File" not "Files"
    expect(screen.getByText(/Clean Up 1 File$/)).toBeTruthy();
  });

  it("shows plural text for cleanup of multiple files", async () => {
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

    // Select all
    fireEvent.click(screen.getByLabelText("Select all"));

    // Open cleanup dialog
    fireEvent.click(screen.getByText(/Clean Up Selected/));

    expect(screen.getByText(/Clean Up 2 Files/)).toBeTruthy();
  });

  it("shows error toast when cleanup of selected files fails", async () => {
    cleanupMissingFilesServerFnMock.mockRejectedValue(new Error("Cleanup selected failed"));
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

    // Select file
    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error("expected checkbox");
    fireEvent.click(rowCheckbox);

    // Open cleanup dialog
    fireEvent.click(screen.getByText(/Clean Up Selected/));

    // Confirm
    const cleanUpBtn = screen.getByRole("button", { name: "Clean Up" });
    fireEvent.click(cleanUpBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Cleanup selected failed");
    });
  });

  it("shows generic error toast when cleanup fails with non-Error", async () => {
    cleanupMissingFilesServerFnMock.mockRejectedValue("something");
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
      expect(mockToast.error).toHaveBeenCalledWith("Failed to clean up files");
    });
  });

  it("loader calls getMissingFilesServerFn", async () => {
    getMissingFilesServerFnMock.mockResolvedValueOnce({ items: [], total: 0 });
    const { Route } = await import("./missing-files");
    const result = await (Route.options.loader as () => Promise<unknown>)();
    expect(getMissingFilesServerFnMock).toHaveBeenCalledWith({
      data: { page: 1, pageSize: 100 },
    });
    expect(result).toEqual({ missingFiles: { items: [], total: 0 } });
  });

  it("shows singular text for clean all dialog with 1 file", async () => {
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
    expect(screen.getByText(/Clean Up All 1 Missing File$/)).toBeTruthy();
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
