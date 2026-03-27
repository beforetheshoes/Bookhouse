// @vitest-environment happy-dom
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const searchEnrichmentMock = vi.fn();
const applyCoverFromUrlMock = vi.fn();

vi.mock("~/lib/server-fns/enrichment", () => ({
  searchEnrichmentServerFn: (...args: unknown[]): unknown => searchEnrichmentMock(...args),
  applyCoverFromUrlServerFn: (...args: unknown[]): unknown => applyCoverFromUrlMock(...args),
}));

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mockToast }));

import { CoverSearchDialog } from "./cover-search-dialog";

beforeEach(() => {
  searchEnrichmentMock.mockReset();
  applyCoverFromUrlMock.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  workId: "w1",
  workTitle: "The Name of the Wind",
  onApplied: vi.fn(),
};

const searchResults = {
  status: "success",
  results: [
    {
      provider: "openlibrary",
      externalId: "OL123W",
      work: { title: "The Name of the Wind", description: null, subjects: [], coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg" },
      edition: {},
      raw: {},
    },
    {
      provider: "googlebooks",
      externalId: "gb_xyz",
      work: { title: "The Name of the Wind", description: null, subjects: [], coverUrl: "https://books.google.com/thumb.jpg" },
      edition: {},
      raw: {},
    },
    {
      provider: "hardcover",
      externalId: "hc_99",
      work: { title: "The Name of the Wind", description: null, subjects: [], coverUrl: null },
      edition: {},
      raw: {},
    },
  ],
};

describe("CoverSearchDialog", () => {
  it("renders dialog with title when open", () => {
    searchEnrichmentMock.mockImplementation(() => new Promise(() => {}));
    render(<CoverSearchDialog {...baseProps} />);

    expect(screen.getByText("Find Cover Image")).toBeTruthy();
  });

  it("auto-searches on open and shows loading state", () => {
    searchEnrichmentMock.mockImplementation(() => new Promise(() => {}));
    render(<CoverSearchDialog {...baseProps} />);

    expect(searchEnrichmentMock).toHaveBeenCalledWith({ data: { workId: "w1" } });
    expect(screen.getByText("Searching for covers...")).toBeTruthy();
  });

  it("displays cover thumbnails in a grid from multiple sources", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Should show 2 covers (OL and GB have coverUrl, HC does not)
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
  });

  it("filters out sources with no coverUrl", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Should not show "Hardcover" badge since it has no cover
    expect(screen.queryByText("Hardcover")).toBeNull();
    expect(screen.getByText("Open Library")).toBeTruthy();
    expect(screen.getByText("Google Books")).toBeTruthy();
  });

  it("clicking a thumbnail selects it", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);
    const user = userEvent.setup();

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const firstCover = screen.getAllByRole("button", { name: /Select cover/i })[0] as HTMLElement;
    await user.click(firstCover);

    // Apply button should be enabled
    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Apply calls applyCoverFromUrlServerFn with selected cover", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);
    applyCoverFromUrlMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const firstCover = screen.getAllByRole("button", { name: /Select cover/i })[0] as HTMLElement;
    await user.click(firstCover);

    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    await user.click(applyBtn);

    await waitFor(() => {
      expect(applyCoverFromUrlMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = (applyCoverFromUrlMock.mock.calls[0] as unknown[])[0] as { data: { workId: string; imageUrl: string; source: { provider: string } } };
    expect(callArgs.data.workId).toBe("w1");
    expect(callArgs.data.imageUrl).toBe("https://covers.openlibrary.org/b/id/42-L.jpg");
    expect(callArgs.data.source.provider).toBe("openlibrary");
  });

  it("URL input: entering URL and applying calls server fn without source", async () => {
    searchEnrichmentMock.mockResolvedValue({ status: "no-results" });
    applyCoverFromUrlMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const urlInput = screen.getByPlaceholderText("Paste image URL...");
    await user.type(urlInput, "https://example.com/my-cover.jpg");

    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    await user.click(applyBtn);

    await waitFor(() => {
      expect(applyCoverFromUrlMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = (applyCoverFromUrlMock.mock.calls[0] as unknown[])[0] as { data: { workId: string; imageUrl: string; source?: unknown } };
    expect(callArgs.data.workId).toBe("w1");
    expect(callArgs.data.imageUrl).toBe("https://example.com/my-cover.jpg");
    expect(callArgs.data.source).toBeUndefined();
  });

  it("Apply button disabled when nothing selected and no URL entered", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows success toast and calls onApplied after successful apply", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);
    applyCoverFromUrlMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const firstCover = screen.getAllByRole("button", { name: /Select cover/i })[0] as HTMLElement;
    await user.click(firstCover);

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Cover image updated");
    });
    expect(baseProps.onApplied).toHaveBeenCalled();
  });

  it("shows error toast on apply failure", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);
    applyCoverFromUrlMock.mockRejectedValue(new Error("Download failed"));
    const user = userEvent.setup();

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const firstCover = screen.getAllByRole("button", { name: /Select cover/i })[0] as HTMLElement;
    await user.click(firstCover);

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to apply cover image");
    });
  });

  it("shows no results message when search returns no covers", async () => {
    searchEnrichmentMock.mockResolvedValue({ status: "no-results" });

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText(/no cover images found/i)).toBeTruthy();
  });

  it("does not search when dialog is closed", () => {
    render(<CoverSearchDialog {...baseProps} open={false} />);

    expect(searchEnrichmentMock).not.toHaveBeenCalled();
  });

  it("shows error state on search failure", async () => {
    searchEnrichmentMock.mockRejectedValue(new Error("Network error"));

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText(/error/i)).toBeTruthy();
  });

  it("cancels in-flight search when dialog unmounts", async () => {
    let resolveSearch: ((value: unknown) => void) | undefined;
    searchEnrichmentMock.mockImplementation(() => new Promise((resolve) => {
      resolveSearch = resolve;
    }));

    const { unmount } = render(<CoverSearchDialog {...baseProps} />);

    unmount();

    if (resolveSearch) {
      resolveSearch(searchResults);
    }

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });

  it("shows no covers message when all sources have null coverUrl", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [
        { provider: "openlibrary", externalId: "OL1", work: { title: "T", description: null, subjects: [], coverUrl: null }, edition: {}, raw: {} },
      ],
    });

    render(<CoverSearchDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText(/no cover images found/i)).toBeTruthy();
  });

  it("cancels in-flight search error when dialog unmounts", async () => {
    let rejectSearch: ((reason: unknown) => void) | undefined;
    searchEnrichmentMock.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectSearch = reject;
    }));

    const { unmount } = render(<CoverSearchDialog {...baseProps} />);

    unmount();

    if (rejectSearch) {
      rejectSearch(new Error("Network error"));
    }

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });

  it("closes dialog when Cancel button is clicked", async () => {
    searchEnrichmentMock.mockResolvedValue(searchResults);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<CoverSearchDialog {...baseProps} onOpenChange={onOpenChange} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
