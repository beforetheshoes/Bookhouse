// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/server-fns/deletion", () => ({
  bulkDeleteWorksServerFn: vi.fn(),
}));

vi.mock("~/lib/server-fns/shelves", () => ({
  bulkAddToShelfServerFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { bulkDeleteWorksServerFn } from "~/lib/server-fns/deletion";
import { bulkAddToShelfServerFn } from "~/lib/server-fns/shelves";
import { LibrarySelectionToolbar } from "./library-selection-toolbar";

const bulkDeleteWorksServerFnMock = vi.mocked(bulkDeleteWorksServerFn);
const bulkAddToShelfServerFnMock = vi.mocked(bulkAddToShelfServerFn);
const mockToast = vi.mocked(toast);

const defaultProps = {
  selectedCount: 1,
  selectedWorkIds: ["w1"],
  shelves: [] as { id: string; name: string; _count: { items: number } }[],
  onDeleted: vi.fn(),
  onAddedToShelf: vi.fn(),
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

    fireEvent.click(screen.getByText("Delete Selected"));
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

    fireEvent.click(screen.getByText("Delete Selected"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("fail");
    });
  });

  it("shows generic error toast when delete fails with non-Error", async () => {
    bulkDeleteWorksServerFnMock.mockRejectedValue("oops");
    render(<LibrarySelectionToolbar {...defaultProps} />);

    fireEvent.click(screen.getByText("Delete Selected"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to delete works");
    });
  });

  it("closes delete dialog on cancel", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText("Delete Selected"));
    expect(screen.getByText(/will remove 1 work/)).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
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

  it("shows empty shelf message when no shelves exist", () => {
    render(<LibrarySelectionToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("bulk-add-to-shelf-btn"));
    expect(screen.getByText(/No shelves created yet/)).toBeTruthy();
  });
});
