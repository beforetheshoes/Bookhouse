// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/server-fns/deletion", () => ({
  bulkDeleteWorksServerFn: vi.fn(),
  bulkDeleteEditionsByFormatForWorksServerFn: vi.fn(),
  deleteAllEditionsByFormatServerFn: vi.fn(),
}));

vi.mock("~/lib/server-fns/work-management", () => ({
  mergeWorksServerFn: vi.fn(),
}));

vi.mock("~/lib/server-fns/shelves", () => ({
  bulkAddToShelfServerFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/components/bulk-enrich-dialog", () => ({
  BulkEnrichDialog: ({ open, onStarted }: { open: boolean; onStarted: () => void }) =>
    open ? <div data-testid="bulk-enrich-dialog"><button data-testid="mock-enrich-start" onClick={onStarted}>Start</button></div> : null,
}));

import { toast } from "sonner";
import { bulkDeleteWorksServerFn, bulkDeleteEditionsByFormatForWorksServerFn, deleteAllEditionsByFormatServerFn } from "~/lib/server-fns/deletion";
import { bulkAddToShelfServerFn } from "~/lib/server-fns/shelves";
import { mergeWorksServerFn } from "~/lib/server-fns/work-management";
import { LibrarySelectionToolbar } from "./library-selection-toolbar";

const bulkDeleteWorksServerFnMock = vi.mocked(bulkDeleteWorksServerFn);
const bulkDeleteByFormatMock = vi.mocked(bulkDeleteEditionsByFormatForWorksServerFn);
const deleteAllByFormatMock = vi.mocked(deleteAllEditionsByFormatServerFn);
const bulkAddToShelfServerFnMock = vi.mocked(bulkAddToShelfServerFn);
const mergeWorksServerFnMock = vi.mocked(mergeWorksServerFn);
const mockToast = vi.mocked(toast);

const defaultProps = {
  selectedCount: 1,
  selectedWorkIds: ["w1"],
  selectedWorks: [{ id: "w1", title: "Book One", editionCount: 2 }],
  shelves: [] as { id: string; name: string; _count: { items: number } }[],
  totalCount: 100,
  allPageRowsSelected: false,
  onSelectAll: vi.fn(),
  selectingAll: false,
  onDeleted: vi.fn(),
  onMerged: vi.fn(),
  onAddedToShelf: vi.fn(),
  onEnrichStarted: vi.fn(),
  onClearSelection: vi.fn(),
};

describe("LibrarySelectionToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when selectedCount is 0", () => {
    const { container } = render(<LibrarySelectionToolbar {...defaultProps} selectedCount={0} selectedWorkIds={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows selection count text", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    expect(screen.getByText(/1 work selected/)).toBeTruthy();
  });

  it("shows plural text for multiple selections", () => {
    render(<LibrarySelectionToolbar {...defaultProps} selectedCount={3} selectedWorkIds={["w1", "w2", "w3"]} />);
    expect(screen.getByText(/3 works selected/)).toBeTruthy();
  });

  it("calls onClearSelection when Clear is clicked", () => {
    const onClearSelection = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} onClearSelection={onClearSelection} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClearSelection).toHaveBeenCalled();
  });

  it("opens delete dialog and calls bulkDeleteWorksServerFn on confirm", async () => {
    bulkDeleteWorksServerFnMock.mockResolvedValue({ deletedWorkIds: ["w1"] });
    const onDeleted = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));
    expect(screen.getByText(/will remove 1 work/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(bulkDeleteWorksServerFnMock).toHaveBeenCalledWith({ data: { workIds: ["w1"] } });
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it("shows error toast when delete fails", async () => {
    bulkDeleteWorksServerFnMock.mockRejectedValue(new Error("fail"));
    render(<LibrarySelectionToolbar {...defaultProps} />);

    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("fail");
    });
  });

  it("shows generic error toast when delete fails with non-Error", async () => {
    bulkDeleteWorksServerFnMock.mockRejectedValue("oops");
    render(<LibrarySelectionToolbar {...defaultProps} />);

    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to delete works");
    });
  });

  it("closes delete dialog on cancel", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("bulk-delete-works-btn"));
    expect(screen.getByText(/will remove 1 work/)).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
  });

  it("renders the dropdown trigger for format-specific delete options", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    expect(screen.getByTestId("bulk-delete-dropdown-trigger")).toBeTruthy();
  });

  it("shows format-specific options when dropdown trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => {
      expect(screen.getByText("Delete ebook editions only")).toBeTruthy();
      expect(screen.getByText("Delete audiobook editions only")).toBeTruthy();
    });
  });

  it("opens ebook format confirmation dialog with correct copy", async () => {
    const user = userEvent.setup();
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => {
      expect(screen.getByText(/Delete Ebook Editions/)).toBeTruthy();
      expect(screen.getByText(/audiobook editions will keep them/)).toBeTruthy();
    });
  });

  it("opens audiobook format confirmation dialog with correct copy", async () => {
    const user = userEvent.setup();
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete audiobook editions only"));
    await user.click(screen.getByText("Delete audiobook editions only"));
    await waitFor(() => {
      expect(screen.getByText(/Delete Audiobook Editions/)).toBeTruthy();
      expect(screen.getByText(/ebook editions will keep them/)).toBeTruthy();
    });
  });

  it("calls bulkDeleteEditionsByFormatForWorksServerFn with EBOOK on confirm", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1"], deletedWorkIds: [] });
    const onDeleted = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} onDeleted={onDeleted} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(bulkDeleteByFormatMock).toHaveBeenCalledWith({ data: { workIds: ["w1"], format: "EBOOK" } });
    });
    await waitFor(() => { expect(onDeleted).toHaveBeenCalled(); });
  });

  it("calls bulkDeleteEditionsByFormatForWorksServerFn with AUDIOBOOK on confirm", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1"], deletedWorkIds: [] });
    const onDeleted = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} onDeleted={onDeleted} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete audiobook editions only"));
    await user.click(screen.getByText("Delete audiobook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(bulkDeleteByFormatMock).toHaveBeenCalledWith({ data: { workIds: ["w1"], format: "AUDIOBOOK" } });
    });
    await waitFor(() => { expect(onDeleted).toHaveBeenCalled(); });
  });

  it("uses deleteAllEditionsByFormatServerFn when selectedCount equals totalCount", async () => {
    const user = userEvent.setup();
    deleteAllByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1", "ed-2"], deletedWorkIds: [] });
    const onDeleted = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} selectedCount={100} selectedWorkIds={Array.from({ length: 100 }, (_, i) => `w${String(i)}`)} totalCount={100} onDeleted={onDeleted} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(deleteAllByFormatMock).toHaveBeenCalledWith({ data: { format: "EBOOK" } });
      expect(bulkDeleteByFormatMock).not.toHaveBeenCalled();
    });
    await waitFor(() => { expect(onDeleted).toHaveBeenCalled(); });
  });

  it("uses deleteAllEditionsByFormatServerFn when selectedWorkIds exceeds 100", async () => {
    const user = userEvent.setup();
    deleteAllByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1"], deletedWorkIds: ["w0"] });
    const manyIds = Array.from({ length: 101 }, (_, i) => `w${String(i)}`);
    render(<LibrarySelectionToolbar {...defaultProps} selectedCount={101} selectedWorkIds={manyIds} totalCount={500} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(deleteAllByFormatMock).toHaveBeenCalledWith({ data: { format: "EBOOK" } });
      expect(bulkDeleteByFormatMock).not.toHaveBeenCalled();
    });
  });

  it("shows success toast with edition count after format delete", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1", "ed-2"], deletedWorkIds: [] });
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("2 ebook editions deleted"));
    });
  });

  it("includes removed work count in success toast when works were deleted (singular)", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1"], deletedWorkIds: ["w1"] });
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("(1 work removed)"));
    });
  });

  it("includes removed works count in success toast when multiple works were deleted (plural)", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockResolvedValue({ deletedEditionIds: ["ed-1", "ed-2"], deletedWorkIds: ["w1", "w2"] });
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("(2 works removed)"));
    });
  });

  it("shows error toast when format delete fails with Error", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockRejectedValue(new Error("db error"));
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("db error");
    });
  });

  it("shows generic error toast when format delete fails with non-Error", async () => {
    const user = userEvent.setup();
    bulkDeleteByFormatMock.mockRejectedValue("oops");
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByTestId("confirm-delete-by-format-btn"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to delete editions");
    });
  });

  it("cancels format delete dialog without calling server fn", async () => {
    const user = userEvent.setup();
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(bulkDeleteByFormatMock).not.toHaveBeenCalled();
  });

  it("opens delete works dialog from the dropdown 'Delete works (all editions)' item", async () => {
    const user = userEvent.setup();
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete works (all editions)"));
    await user.click(screen.getByText("Delete works (all editions)"));
    await waitFor(() => {
      expect(screen.getByText(/will remove 1 work/)).toBeTruthy();
    });
  });

  it("closes format delete dialog via Escape key (onOpenChange)", async () => {
    const user = userEvent.setup();
    render(<LibrarySelectionToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("bulk-delete-dropdown-trigger"));
    await waitFor(() => screen.getByText("Delete ebook editions only"));
    await user.click(screen.getByText("Delete ebook editions only"));
    await waitFor(() => screen.getByTestId("confirm-delete-by-format-btn"));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-delete-by-format-btn")).toBeFalsy();
    });
  });

  it("opens shelf picker and calls bulkAddToShelfServerFn", async () => {
    bulkAddToShelfServerFnMock.mockResolvedValue({ added: 1 });
    const onAddedToShelf = vi.fn();
    const shelves = [{ id: "s1", name: "Fiction", _count: { items: 3 } }];
    render(<LibrarySelectionToolbar {...defaultProps} shelves={shelves} onAddedToShelf={onAddedToShelf} />);

    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));
    expect(screen.getByTestId("shelf-picker")).toBeTruthy();

    fireEvent.click(screen.getByTestId("shelf-pick-s1"));

    await waitFor(() => {
      expect(bulkAddToShelfServerFnMock).toHaveBeenCalledWith({ data: { shelfId: "s1", workIds: ["w1"] } });
    });
    await waitFor(() => {
      expect(onAddedToShelf).toHaveBeenCalled();
    });
  });

  it("shows error toast when shelf add fails", async () => {
    bulkAddToShelfServerFnMock.mockRejectedValue(new Error("DB error"));
    const shelves = [{ id: "s1", name: "Fiction", _count: { items: 3 } }];
    render(<LibrarySelectionToolbar {...defaultProps} shelves={shelves} />);

    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));
    fireEvent.click(screen.getByTestId("shelf-pick-s1"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to add to shelf");
    });
  });

  it("shows select-all banner when all page rows are selected", () => {
    render(<LibrarySelectionToolbar {...defaultProps} allPageRowsSelected={true} selectedCount={1} totalCount={100} />);
    expect(screen.getByTestId("select-all-banner")).toBeTruthy();
    expect(screen.getByText(/Select all 100 works/)).toBeTruthy();
  });

  it("does not show select-all banner when not all page rows selected", () => {
    render(<LibrarySelectionToolbar {...defaultProps} allPageRowsSelected={false} selectedCount={1} totalCount={100} />);
    expect(screen.queryByTestId("select-all-banner")).toBeFalsy();
  });

  it("does not show select-all banner when all works are already selected", () => {
    render(<LibrarySelectionToolbar {...defaultProps} allPageRowsSelected={true} selectedCount={100} totalCount={100} />);
    expect(screen.queryByTestId("select-all-banner")).toBeFalsy();
  });

  it("calls onSelectAll when select-all button is clicked", () => {
    const onSelectAll = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} allPageRowsSelected={true} selectedCount={1} totalCount={100} onSelectAll={onSelectAll} />);
    fireEvent.click(screen.getByTestId("select-all-btn"));
    expect(onSelectAll).toHaveBeenCalled();
  });

  it("shows loading state when selectingAll is true", () => {
    render(<LibrarySelectionToolbar {...defaultProps} allPageRowsSelected={true} selectedCount={1} totalCount={100} selectingAll={true} />);
    expect(screen.getByText(/Selecting/)).toBeTruthy();
  });

  it("calls onEnrichStarted when BulkEnrichDialog fires onStarted", () => {
    const onEnrichStarted = vi.fn();
    render(<LibrarySelectionToolbar {...defaultProps} onEnrichStarted={onEnrichStarted} />);
    fireEvent.click(screen.getByTestId("bulk-enrich-btn"));
    fireEvent.click(screen.getByTestId("mock-enrich-start"));
    expect(onEnrichStarted).toHaveBeenCalled();
  });

  it("opens bulk enrich dialog when Enrich Metadata is clicked", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("bulk-enrich-btn"));
    expect(screen.getByTestId("bulk-enrich-dialog")).toBeTruthy();
  });

  it("shows empty shelf message when no shelves exist", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));
    expect(screen.getByText(/No shelves created yet/)).toBeTruthy();
  });

  describe("merge works", () => {
    const mergeProps = {
      ...defaultProps,
      selectedCount: 3,
      selectedWorkIds: ["w1", "w2", "w3"],
      selectedWorks: [
        { id: "w1", title: "Book A", editionCount: 1 },
        { id: "w2", title: "Book B", editionCount: 3 },
        { id: "w3", title: "Book C", editionCount: 2 },
      ],
    };

    it("does not show merge button when selectedCount < 2", () => {
      render(<LibrarySelectionToolbar {...defaultProps} />);
      expect(screen.queryByTestId("merge-works-btn")).toBeNull();
    });

    it("shows merge button when selectedCount >= 2", () => {
      render(<LibrarySelectionToolbar {...mergeProps} />);
      expect(screen.getByTestId("merge-works-btn")).toBeTruthy();
    });

    it("opens merge dialog on click", () => {
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      expect(screen.getByText("Merge 3 Works")).toBeTruthy();
    });

    it("lists selected works with radio buttons", () => {
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      expect(screen.getByText("Book A")).toBeTruthy();
      expect(screen.getByText("Book B")).toBeTruthy();
      expect(screen.getByText("Book C")).toBeTruthy();
      expect(screen.getAllByRole("radio")).toHaveLength(3);
    });

    it("defaults target to work with most editions", () => {
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      const radios = screen.getAllByRole("radio");
      // Book B has 3 editions (most), should be checked by default
      const bookBRadio = radios.find((r) => (r as HTMLInputElement).value === "w2");
      expect((bookBRadio as HTMLInputElement).checked).toBe(true);
    });

    it("calls mergeWorksServerFn on confirm", async () => {
      mergeWorksServerFnMock.mockResolvedValue({ targetWorkId: "w2", mergedWorkIds: ["w1", "w3"] });
      const onMerged = vi.fn();
      render(<LibrarySelectionToolbar {...mergeProps} onMerged={onMerged} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));

      await waitFor(() => {
        expect(mergeWorksServerFnMock).toHaveBeenCalledWith({
          data: { targetWorkId: "w2", sourceWorkIds: ["w1", "w3"] },
        });
      });
      await waitFor(() => {
        expect(onMerged).toHaveBeenCalled();
      });
    });

    it("shows error toast on merge failure with Error", async () => {
      mergeWorksServerFnMock.mockRejectedValue(new Error("merge failed"));
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("merge failed");
      });
    });

    it("shows fallback error toast on non-Error merge failure", async () => {
      mergeWorksServerFnMock.mockRejectedValue("unknown");
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to merge works");
      });
    });

    it("closes merge dialog on cancel", () => {
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      expect(screen.getByText("Merge 3 Works")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Merge 3 Works")).toBeNull();
    });

    it("allows changing the target work via radio", () => {
      render(<LibrarySelectionToolbar {...mergeProps} />);
      fireEvent.click(screen.getByTestId("merge-works-btn"));
      const radios = screen.getAllByRole("radio");
      const bookARadio = radios.find((r) => (r as HTMLInputElement).value === "w1") as HTMLInputElement;
      fireEvent.click(bookARadio);
      expect(bookARadio.checked).toBe(true);
    });
  });
});
