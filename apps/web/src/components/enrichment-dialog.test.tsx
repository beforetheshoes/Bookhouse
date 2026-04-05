// @vitest-environment happy-dom
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Force-cast for testing type-mismatch scenarios (e.g., passing boolean where string expected) */
function forceCast<T>(value: T | string | number | boolean | object): T {
  return value as T & typeof value;
}

const { searchEnrichmentMock, applyEnrichmentMock, applyCoverFromUrlMock } = vi.hoisted(() => ({
  searchEnrichmentMock: vi.fn(),
  applyEnrichmentMock: vi.fn(),
  applyCoverFromUrlMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/enrichment", () => ({
  searchEnrichmentServerFn: searchEnrichmentMock,
  applyEnrichmentServerFn: applyEnrichmentMock,
  applyCoverFromUrlServerFn: applyCoverFromUrlMock,
}));

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mockToast }));

import { EnrichmentDialog, formatDuration } from "./enrichment-dialog";

beforeEach(() => {
  searchEnrichmentMock.mockReset();
  applyEnrichmentMock.mockReset();
  applyCoverFromUrlMock.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  workId: "w1",
  editionId: "e1" as string | null,
  currentWork: {
    title: "The Name of the Wind",
    authors: ["Patrick Rothfuss"] as string[],
    description: null as string | null,
    coverPath: null as string | null,
    tags: [] as string[],
    editedFields: [] as string[],
  },
  currentEdition: {
    publisher: null as string | null,
    publishedDate: null as string | null,
    isbn13: null as string | null,
    isbn10: null as string | null,
    language: null as string | null,
    pageCount: null as number | null,
    asin: null as string | null,
    duration: null as number | null,
    narrators: [] as string[],
    editedFields: [] as string[],
  },
  onApplied: vi.fn(),
};

const olResult = {
  provider: "openlibrary" as const,
  externalId: "OL123W",
  work: { title: "The Name of the Wind", authors: ["Patrick Rothfuss"], description: "A story about Kvothe", subjects: ["Fantasy", "Epic"], coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg" },
  edition: { publisher: "DAW Books", publishedDate: "April 2007", pageCount: 662, isbn13: "9780756404741", isbn10: "0756404746", asin: null, duration: null, narrators: null },
  raw: {},
};

const gbResult = {
  provider: "googlebooks" as const,
  externalId: "gb_xyz",
  work: { title: "The Name of the Wind", authors: ["Patrick Rothfuss"], description: "The riveting first-person narrative", subjects: ["Fiction"], coverUrl: "https://books.google.com/thumb.jpg" },
  edition: { publisher: "DAW", publishedDate: "2007-04-01", pageCount: 662, isbn13: "9780756404741", isbn10: null, asin: null, duration: null, narrators: null },
  raw: {},
};

describe("EnrichmentDialog", () => {
  it("renders the dialog with header when open", () => {
    searchEnrichmentMock.mockImplementation(() => new Promise(() => {}));
    render(<EnrichmentDialog {...baseProps} />);

    expect(screen.getByText("Enrich Metadata")).toBeTruthy();
  });

  it("auto-searches on open and shows loading skeleton", () => {
    searchEnrichmentMock.mockImplementation(() => new Promise(() => {}));
    render(<EnrichmentDialog {...baseProps} />);

    expect(searchEnrichmentMock).toHaveBeenCalledWith({ data: { workId: "w1", editionId: "e1" } });
    // Should show loading state
    expect(screen.getByText("Searching sources...")).toBeTruthy();
  });

  it("shows tabs with results from multiple sources", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult, gbResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByRole("tab", { name: "Open Library" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Google Books" })).toBeTruthy();
  });

  it("displays work-level and edition-level fields with labels", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Work fields
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("A story about Kvothe")).toBeTruthy();
    expect(screen.getByText("Tags")).toBeTruthy();

    // Edition fields
    expect(screen.getByText("Publisher")).toBeTruthy();
    expect(screen.getByText("DAW Books")).toBeTruthy();
    expect(screen.getByText("Pages")).toBeTruthy();
    expect(screen.getByText("662")).toBeTruthy();
    expect(screen.getByText("ISBN-13")).toBeTruthy();
  });

  it("shows current values alongside source values", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, description: "Existing desc" }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Existing desc")).toBeTruthy();
    expect(screen.getByText("A story about Kvothe")).toBeTruthy();
  });

  it("shows Edited badge for manually edited fields", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, editedFields: ["description"] }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("shows field count in footer", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Should show selected count (all non-edited fields pre-selected)
    expect(screen.getByText(/fields? selected/)).toBeTruthy();
  });

  it("calls applyEnrichmentServerFn and onApplied on apply", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(applyEnrichmentMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = applyEnrichmentMock.mock.calls[0]?.[0] as { data: { source: { provider: string } } };
    expect(callArgs.data.source.provider).toBe("openlibrary");
    expect(baseProps.onApplied).toHaveBeenCalled();
  });

  it("shows no results message", async () => {
    searchEnrichmentMock.mockResolvedValue({ status: "no-results" });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText(/no results/i)).toBeTruthy();
  });

  it("shows rate-limited message", async () => {
    searchEnrichmentMock.mockResolvedValue({ status: "rate-limited", retryAfterMs: 5000 });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText(/rate limited/i)).toBeTruthy();
  });

  it("can switch between source tabs", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult, gbResult],
    });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("tab", { name: "Google Books" }));

    expect(screen.getByText("The riveting first-person narrative")).toBeTruthy();
  });

  it("does not show edition section when no edition context", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} editionId={null} currentEdition={null} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Work data should show
    expect(screen.getByText("A story about Kvothe")).toBeTruthy();
    // Edition header should not show
    expect(screen.queryByText("Edition Data")).toBeNull();
  });

  it("does not search when dialog is closed", () => {
    render(<EnrichmentDialog {...baseProps} open={false} />);

    expect(searchEnrichmentMock).not.toHaveBeenCalled();
  });

  it("shows error state on search failure", async () => {
    searchEnrichmentMock.mockRejectedValue(new Error("Network error"));

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText(/error/i)).toBeTruthy();
  });

  it("shows source cover image when available", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const img = screen.getByAltText("Source cover");
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain("covers.openlibrary.org");
  });

  it("renders subjects as comma-separated tags", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Fantasy, Epic")).toBeTruthy();
  });

  it("returns null for FieldComparisonRow when sourceValue is empty", async () => {
    const resultWithEmptyDesc = {
      ...olResult,
      work: { ...olResult.work, description: null },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithEmptyDesc],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Description row should not appear since source value is empty
    expect(screen.queryByText("Description")).toBeNull();
    // Tags should still appear
    expect(screen.getByText("Tags")).toBeTruthy();
  });

  it("deselects a field when toggling an already-selected field", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Description should be pre-selected (no editedFields, values don't match)
    // Click "Deselect field" button to deselect
    const deselectButtons = screen.getAllByLabelText("Deselect field");
    expect(deselectButtons.length).toBeGreaterThan(0);

    const firstDeselect = deselectButtons[0] as HTMLElement;
    await user.click(firstDeselect);

    // Now there should be a "Select field" button where we clicked
    const selectButtons = screen.getAllByLabelText("Select field");
    expect(selectButtons.length).toBeGreaterThan(0);
  });

  it("selects a field when toggling an unselected field (shows Circle icon)", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    const user = userEvent.setup();

    // Use currentWork with matching description so description is not pre-selected
    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, description: "A story about Kvothe" }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Description should NOT be pre-selected since current matches source
    const selectButtons = screen.getAllByLabelText("Select field");
    expect(selectButtons.length).toBeGreaterThan(0);

    const firstSelect = selectButtons[0] as HTMLElement;
    await user.click(firstSelect);

    // After clicking, it should become a "Deselect field" button
    const deselectButtons = screen.getAllByLabelText("Deselect field");
    expect(deselectButtons.length).toBeGreaterThan(0);
  });

  it("shows error toast when handleApply fails", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(mockToast.error).toHaveBeenCalledWith("Failed to apply metadata");
  });

  it("renders edition fields with source and current values", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentEdition={{
      ...baseProps.currentEdition,
      publisher: "Old Publisher",
      isbn13: "9780000000000",
    }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Edition fields should appear
    expect(screen.getByText("Edition Data")).toBeTruthy();
    expect(screen.getByText("Publisher")).toBeTruthy();
    expect(screen.getByText("Old Publisher")).toBeTruthy();
    expect(screen.getByText("DAW Books")).toBeTruthy();
    expect(screen.getByText("ISBN-13")).toBeTruthy();
    expect(screen.getByText("9780000000000")).toBeTruthy();
  });

  it("does not pre-select fields that already match current values", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    // Set description to match source value exactly
    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, description: "A story about Kvothe" }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Description (and title) should show "Already matches" text
    expect(screen.getAllByText("Already matches").length).toBeGreaterThan(0);
  });

  it("does not pre-select edition fields that were manually edited", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentEdition={{
      ...baseProps.currentEdition,
      editedFields: ["publisher"],
    }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Publisher should show "Edited" badge
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("pre-selects edition fields when values differ and not edited", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // All fields should be pre-selected since no edited fields and current values are null
    const deselectButtons = screen.getAllByLabelText("Deselect field");
    // Should have multiple deselect buttons (work fields + edition fields)
    expect(deselectButtons.length).toBeGreaterThan(2);
  });

  it("shows BookOpen placeholder when source has no coverUrl", async () => {
    const resultWithNoCover = {
      ...olResult,
      work: { ...olResult.work, coverUrl: null },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithNoCover],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Should not find any source cover image
    expect(screen.queryByAltText("Source cover")).toBeNull();
  });

  it("shows custom error message from search failure", async () => {
    searchEnrichmentMock.mockRejectedValue(new Error("Custom API error"));

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Custom API error")).toBeTruthy();
  });

  it("shows generic error message for non-Error search failure", async () => {
    searchEnrichmentMock.mockRejectedValue("string error");

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Search failed")).toBeTruthy();
  });

  it("does not pre-select edition fields that already match current values", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentEdition={{
      ...baseProps.currentEdition,
      publisher: "DAW Books",
      publishedDate: "April 2007",
      pageCount: 662,
      isbn13: "9780756404741",
      isbn10: "0756404746",
    }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // All edition values match, so none should be pre-selected for edition fields
    // Work fields will still be pre-selected since they differ
    const matches = screen.getAllByText("Already matches");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 0 fields selected and disabled Apply when nothing is selected", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    // Make all values match so nothing is pre-selected (coverPath set so coverUrl isn't pre-selected)
    render(<EnrichmentDialog {...baseProps}
      currentWork={{ ...baseProps.currentWork, description: "A story about Kvothe", tags: ["Fantasy", "Epic"], coverPath: "w1" }}
      currentEdition={{
        ...baseProps.currentEdition,
        publisher: "DAW Books",
        publishedDate: "April 2007",
        pageCount: 662,
        isbn13: "9780756404741",
        isbn10: "0756404746",
      }}
    />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("0 fields selected")).toBeTruthy();
    const applyBtn = screen.getByRole("button", { name: "Apply Selected" });
    expect(applyBtn).toBeTruthy();
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows 1 field selected text", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    // Make all values match except description (coverPath set so coverUrl isn't pre-selected)
    render(<EnrichmentDialog {...baseProps}
      currentWork={{ ...baseProps.currentWork, tags: ["Fantasy", "Epic"], coverPath: "w1" }}
      currentEdition={{
        ...baseProps.currentEdition,
        publisher: "DAW Books",
        publishedDate: "April 2007",
        pageCount: 662,
        isbn13: "9780756404741",
        isbn10: "0756404746",
      }}
    />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("1 field selected")).toBeTruthy();
  });

  it("closes dialog when Cancel button is clicked", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} onOpenChange={onOpenChange} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("formats boolean value as empty string via formatValue fallback", async () => {
    // Create a result where all edition fields are booleans to exercise formatValue fallback
    const resultWithBoolFields = {
      ...olResult,
      work: { ...olResult.work, description: forceCast<string>({ nested: true }), subjects: ["Fantasy"] },
      edition: {
        publisher: forceCast<string>(true),
        publishedDate: forceCast<string>(true),
        pageCount: forceCast<number>(true),
        isbn13: forceCast<string>(true),
        isbn10: forceCast<string>(true),
        asin: null,
        duration: null,
        narrators: null,
      },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithBoolFields],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Description row should not render since formatValue({nested: true}) returns ""
    // Publisher etc rows should not render since formatValue(true) returns ""
    // Tags should still render because subjects is a valid array
    expect(screen.getByText("Tags")).toBeTruthy();
    // Publisher should not appear as a comparison row (sourceValue is empty)
    expect(screen.queryByText("Publisher")).toBeNull();
  });

  it("applies with only edition fields selected (no work fields)", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} currentWork={{
      ...baseProps.currentWork,
      description: "A story about Kvothe",
      tags: ["Fantasy", "Epic"],
    }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // All work fields match, so only edition fields should be pre-selected
    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(applyEnrichmentMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = applyEnrichmentMock.mock.calls[0]?.[0] as { data: { workFields: object; editionFields: object; editionId: string } };
    // workFields should be undefined since no work fields were selected
    expect(callArgs.data.workFields).toBeUndefined();
    // editionFields should be defined
    expect(callArgs.data.editionFields).toBeDefined();
    expect(callArgs.data.editionId).toBe("e1");
  });

  it("applies with only work fields selected (no edition fields)", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} currentEdition={{
      ...baseProps.currentEdition,
      publisher: "DAW Books",
      publishedDate: "April 2007",
      pageCount: 662,
      isbn13: "9780756404741",
      isbn10: "0756404746",
    }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // All edition fields match, so only work fields should be pre-selected
    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(applyEnrichmentMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = applyEnrichmentMock.mock.calls[0]?.[0] as { data: { workFields: object; editionFields: object; editionId: string | undefined } };
    // workFields should be defined
    expect(callArgs.data.workFields).toBeDefined();
    // editionFields should be undefined since no edition fields selected
    expect(callArgs.data.editionFields).toBeUndefined();
    // editionId should be undefined since no edition fields
    expect(callArgs.data.editionId).toBeUndefined();
  });

  it("cancels in-flight search when dialog unmounts", async () => {
    let resolveSearch: ((value: object) => void) | undefined;
    searchEnrichmentMock.mockImplementation(() => new Promise((resolve) => {
      resolveSearch = resolve;
    }));

    const { unmount } = render(<EnrichmentDialog {...baseProps} />);

    // Unmount while search is pending (triggers ctrl.cancelled = true)
    unmount();

    // Resolve the search after unmount
    if (resolveSearch) {
      resolveSearch({ status: "success", results: [olResult] });
    }

    // No error should occur - the cancelled check prevents state updates
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });

  it("cancels in-flight search error when dialog unmounts", async () => {
    let rejectSearch: ((reason: Error) => void) | undefined;
    searchEnrichmentMock.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectSearch = reject;
    }));

    const { unmount } = render(<EnrichmentDialog {...baseProps} />);

    // Unmount while search is pending
    unmount();

    // Reject the search after unmount (triggers catch branch with ctrl.cancelled)
    if (rejectSearch) {
      rejectSearch(new Error("Network error"));
    }

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });

  it("field selection persists across tab switch", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult, gbResult],
    });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // On OL tab, deselect the first field (description)
    const deselectButtons = screen.getAllByLabelText("Deselect field");
    const firstDeselect = deselectButtons[0] as HTMLElement;
    await user.click(firstDeselect);

    // Verify it's now deselected
    expect(screen.getAllByLabelText("Select field").length).toBeGreaterThan(0);

    // Switch to GB tab
    await user.click(screen.getByRole("tab", { name: "Google Books" }));

    // Switch back to OL tab
    await user.click(screen.getByRole("tab", { name: "Open Library" }));

    // Description should still be deselected (Select field button should still be present)
    expect(screen.getAllByLabelText("Select field").length).toBeGreaterThan(0);
  });

  it("dialog stays open on apply failure and Apply button re-enables", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockRejectedValue(new Error("Server error"));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} onOpenChange={onOpenChange} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    await user.click(applyBtn);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Error toast shown
    expect(mockToast.error).toHaveBeenCalledWith("Failed to apply metadata");
    // Dialog should NOT have been closed
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Apply button should be re-enabled (not disabled)
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not render Tags row when source has empty subjects array", async () => {
    const resultWithEmptySubjects = {
      ...olResult,
      work: { ...olResult.work, subjects: [] },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithEmptySubjects],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Tags row should not render because empty array formats to empty string
    expect(screen.queryByText("Tags")).toBeNull();
    // Description should still show
    expect(screen.getByText("Description")).toBeTruthy();
  });

  it("handles source with all-null work and edition data except title", async () => {
    const emptyResult = {
      provider: "openlibrary" as const,
      externalId: "OL999W",
      work: { title: "The Name of the Wind", description: null, subjects: [], coverUrl: null },
      edition: { publisher: null, publishedDate: null, pageCount: null, isbn13: null, isbn10: null, asin: null, duration: null, narrators: null },
      raw: {},
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [emptyResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // No field comparison rows should render for null/empty values
    expect(screen.queryByText("Description")).toBeNull();
    expect(screen.queryByText("Tags")).toBeNull();
    expect(screen.queryByText("Publisher")).toBeNull();
    expect(screen.queryByText("Pages")).toBeNull();
    expect(screen.queryByText("ISBN-13")).toBeNull();
    expect(screen.queryByText("ISBN-10")).toBeNull();
    // Title matches so it shows "Already matches" — not pre-selected
    expect(screen.getByText("0 fields selected")).toBeTruthy();
    const applyBtn = screen.getByRole("button", { name: "Apply Selected" });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("handles toggle for edition fields (deselect path)", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Find all deselect buttons - some are work fields, some edition
    const deselectButtons = screen.getAllByLabelText("Deselect field");
    // Click the last deselect button (which should be an edition field)
    const lastDeselect = deselectButtons[deselectButtons.length - 1] as HTMLElement;
    await user.click(lastDeselect);

    // Count should decrease
    const selectButtons = screen.getAllByLabelText("Select field");
    expect(selectButtons.length).toBeGreaterThan(0);
  });

  it("shows Cover Image field row when source has coverUrl", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Cover Image")).toBeTruthy();
  });

  it("does not show Cover Image row when source coverUrl is null", async () => {
    const resultWithNoCover = {
      ...olResult,
      work: { ...olResult.work, coverUrl: null },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithNoCover],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.queryByText("Cover Image")).toBeNull();
  });

  it("pre-selects coverUrl when work has no coverPath", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, coverPath: null }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Cover Image")).toBeTruthy();
    // Should find a deselect button for it (pre-selected)
    const coverRow = screen.getByText("Cover Image").closest(".group");
    expect(coverRow?.querySelector("[aria-label='Deselect field']")).toBeTruthy();
  });

  it("does not pre-select coverUrl when work already has a coverPath", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, coverPath: "w1" }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Cover Image")).toBeTruthy();
    // Should find a select button for it (not pre-selected)
    const coverRow = screen.getByText("Cover Image").closest(".group");
    expect(coverRow?.querySelector("[aria-label='Select field']")).toBeTruthy();
  });

  it("calls applyCoverFromUrlServerFn when coverUrl is selected on apply", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });
    applyCoverFromUrlMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(applyCoverFromUrlMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = applyCoverFromUrlMock.mock.calls[0]?.[0] as { data: { workId: string; imageUrl: string; source: { provider: string } } };
    expect(callArgs.data.workId).toBe("w1");
    expect(callArgs.data.imageUrl).toBe("https://covers.openlibrary.org/b/id/42-L.jpg");
    expect(callArgs.data.source.provider).toBe("openlibrary");
  });

  it("does not call applyCoverFromUrlServerFn when coverUrl is not selected", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    // Work already has a cover, so coverUrl won't be pre-selected
    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, coverPath: "w1" }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(applyEnrichmentMock).toHaveBeenCalledTimes(1);
    });

    expect(applyCoverFromUrlMock).not.toHaveBeenCalled();
  });

  it("strips coverUrl from workFields sent to applyEnrichmentServerFn", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });
    applyCoverFromUrlMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(applyEnrichmentMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = applyEnrichmentMock.mock.calls[0]?.[0] as { data: { workFields?: Record<string, string | number | boolean | null | object> } };
    // coverUrl should NOT be in the workFields sent to applyEnrichmentServerFn
    expect(callArgs.data.workFields?.coverUrl).toBeUndefined();
  });

  it("shows Title field when source title differs from current title", async () => {
    const resultWithDiffTitle = {
      ...olResult,
      work: { ...olResult.work, title: "The Name of the Wind: Anniversary Edition" },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithDiffTitle],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Title")).toBeTruthy();
    // Title appears in both SourceHeader and the field row
    expect(screen.getAllByText("The Name of the Wind: Anniversary Edition").length).toBeGreaterThanOrEqual(1);
  });

  it("does not pre-select title when titles already match", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Title should show "Already matches" since source and current are the same
    // Find the Title row - it should not be pre-selected
    const titleText = screen.queryByText("Title");
    // When titles match, the "Already matches" text should appear for it
    if (titleText) {
      const row = titleText.closest(".group");
      expect(row?.querySelector("[aria-label='Select field']")).toBeTruthy();
    }
  });

  it("pre-selects title when it differs and titleDisplay is not edited", async () => {
    const resultWithDiffTitle = {
      ...olResult,
      work: { ...olResult.work, title: "The Name of the Wind: Revised" },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithDiffTitle],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Title")).toBeTruthy();
    // Should be pre-selected (deselect button visible)
    const titleRow = screen.getByText("Title").closest(".group");
    expect(titleRow?.querySelector("[aria-label='Deselect field']")).toBeTruthy();
  });

  it("does not pre-select title when titleDisplay has been edited", async () => {
    const resultWithDiffTitle = {
      ...olResult,
      work: { ...olResult.work, title: "The Name of the Wind: Revised" },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithDiffTitle],
    });

    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, editedFields: ["titleDisplay"] }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("shows Authors field when source authors differ from current", async () => {
    const resultWithDiffAuthors = {
      ...olResult,
      work: { ...olResult.work, authors: ["Patrick Rothfuss", "Lin-Manuel Miranda"] },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithDiffAuthors],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Authors")).toBeTruthy();
    expect(screen.getByText("Patrick Rothfuss, Lin-Manuel Miranda")).toBeTruthy();
  });

  it("does not pre-select authors when they already match", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    // Source has ["Patrick Rothfuss"], current has ["Patrick Rothfuss"] — match
    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Authors row should show "Already matches"
    const authorsRow = screen.getByText("Authors").closest(".group");
    expect(authorsRow?.querySelector("[aria-label='Select field']")).toBeTruthy();
  });

  it("does not pre-select authors when field has been manually edited", async () => {
    const resultWithDiffAuthors = {
      ...olResult,
      work: { ...olResult.work, authors: ["P. Rothfuss"] },
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [resultWithDiffAuthors],
    });

    render(<EnrichmentDialog {...baseProps} currentWork={{ ...baseProps.currentWork, editedFields: ["authors"] }} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Should show Edited badge
    const authorsRow = screen.getByText("Authors").closest(".group");
    expect(authorsRow?.querySelector("[aria-label='Select field']")).toBeTruthy();
  });

  it("displays duration formatted as hours and minutes", async () => {
    const audibleResult = {
      provider: "audible" as const,
      externalId: "B08G9PRS1K",
      work: { title: "The Name of the Wind", authors: ["Patrick Rothfuss"], description: null, subjects: [], coverUrl: null },
      edition: { publisher: "Macmillan Audio", publishedDate: "2007-07-17", pageCount: null, isbn13: null, isbn10: null, asin: "B08G9PRS1K", duration: 83760, narrators: ["Nick Podehl"] },
      raw: {},
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [audibleResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // 83760 seconds = 23h 16m
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("23h 16m")).toBeTruthy();
  });

  it("displays narrators field from Audible source", async () => {
    const audibleResult = {
      provider: "audible" as const,
      externalId: "B08G9PRS1K",
      work: { title: "The Name of the Wind", authors: ["Patrick Rothfuss"], description: null, subjects: [], coverUrl: null },
      edition: { publisher: "Macmillan Audio", publishedDate: "2007-07-17", pageCount: null, isbn13: null, isbn10: null, asin: "B08G9PRS1K", duration: 79200, narrators: ["Nick Podehl", "Rupert Degas"] },
      raw: {},
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [audibleResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Narrators")).toBeTruthy();
    expect(screen.getByText("Nick Podehl, Rupert Degas")).toBeTruthy();
  });

  it("displays ASIN field from Audible source", async () => {
    const audibleResult = {
      provider: "audible" as const,
      externalId: "B08G9PRS1K",
      work: { title: "The Name of the Wind", authors: ["Patrick Rothfuss"], description: null, subjects: [], coverUrl: null },
      edition: { publisher: "Macmillan Audio", publishedDate: null, pageCount: null, isbn13: null, isbn10: null, asin: "B08G9PRS1K", duration: null, narrators: null },
      raw: {},
    };
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [audibleResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("ASIN")).toBeTruthy();
    // ASIN value appears in both source header (externalId) and the field row
    expect(screen.getAllByText("B08G9PRS1K").length).toBeGreaterThanOrEqual(2);
  });

  it("shows only work fields when mode is 'work'", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} mode="work" />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Enrich Work")).toBeTruthy();
    expect(screen.getByText("Work Data")).toBeTruthy();
    expect(screen.queryByText("Edition Data")).toBeNull();
  });

  it("shows only edition fields when mode is 'edition'", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} mode="edition" />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Enrich Edition")).toBeTruthy();
    expect(screen.queryByText("Work Data")).toBeNull();
    expect(screen.getByText("Edition Data")).toBeTruthy();
  });

  it("shows both sections when mode is not specified", async () => {
    searchEnrichmentMock.mockResolvedValue({
      status: "success",
      results: [olResult],
    });

    render(<EnrichmentDialog {...baseProps} />);

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Enrich Metadata")).toBeTruthy();
    expect(screen.getByText("Work Data")).toBeTruthy();
    expect(screen.getByText("Edition Data")).toBeTruthy();
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(83760)).toBe("23h 16m");
  });

  it("formats hours only when no minutes", () => {
    expect(formatDuration(7200)).toBe("2h");
  });

  it("formats minutes only when less than an hour", () => {
    expect(formatDuration(1800)).toBe("30m");
  });
});
