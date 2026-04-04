// @vitest-environment happy-dom
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bulkEnrichMock, integrationStatusMock } = vi.hoisted(() => ({
  bulkEnrichMock: vi.fn(),
  integrationStatusMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/bulk-enrich", () => ({
  bulkEnrichServerFn: bulkEnrichMock,
}));

vi.mock("~/lib/server-fns/integrations", () => ({
  getIntegrationStatusServerFn: integrationStatusMock,
}));

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mockToast }));

import { BulkEnrichDialog } from "./bulk-enrich-dialog";

beforeEach(() => {
  bulkEnrichMock.mockReset();
  integrationStatusMock.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  integrationStatusMock.mockResolvedValue({
    openlibrary: { configured: true, label: "Open Library" },
    googlebooks: { configured: true, label: "Google Books" },
    hardcover: { configured: false, label: "Hardcover" },
  });
});

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedCount: 5,
  selectedWorkIds: ["w1", "w2", "w3", "w4", "w5"],
  onStarted: vi.fn(),
};

describe("BulkEnrichDialog", () => {
  it("renders the dialog with title and description", async () => {
    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByText("Enrich 5 Works")).toBeTruthy();
    expect(screen.getByText(/Fills in missing metadata/)).toBeTruthy();
  });

  it("shows available sources based on integration status", async () => {
    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(screen.getByLabelText("Open Library")).toBeTruthy();
    expect(screen.getByLabelText("Google Books")).toBeTruthy();
    expect(screen.getByLabelText("Hardcover")).toBeTruthy();
  });

  it("disables unconfigured sources with helper text", async () => {
    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const hardcoverCheckbox = screen.getByLabelText("Hardcover");
    expect(hardcoverCheckbox.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("(Not configured)")).toBeTruthy();
  });

  it("pre-checks Open Library by default", async () => {
    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const olCheckbox = screen.getByLabelText("Open Library");
    expect((olCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it("defaults to fullest strategy", async () => {
    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const fullestRadio = screen.getByLabelText("Fullest data");
    expect((fullestRadio as HTMLInputElement).checked).toBe(true);
  });

  it("calls bulkEnrichServerFn with correct params on submit", async () => {
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 5 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    // Both OL and GB are configured, so both are pre-selected
    expect(bulkEnrichMock).toHaveBeenCalledWith({
      data: {
        workIds: ["w1", "w2", "w3", "w4", "w5"],
        sources: ["openlibrary", "googlebooks"],
        strategy: "fullest",
      },
    });
    expect(mockToast.success).toHaveBeenCalled();
    expect(baseProps.onStarted).toHaveBeenCalled();
  });

  it("disables start button when no sources are selected", async () => {
    const user = userEvent.setup();
    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Uncheck both pre-selected sources (OL and GB)
    const olCheckbox = screen.getByLabelText("Open Library");
    await user.click(olCheckbox);
    const gbCheckbox = screen.getByLabelText("Google Books");
    await user.click(gbCheckbox);

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    expect(startBtn.hasAttribute("disabled")).toBe(true);
  });

  it("shows singular form for 1 work", async () => {
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 1 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} selectedCount={1} selectedWorkIds={["w1"]} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(mockToast.success).toHaveBeenCalledWith("Enrichment started for 1 work");
  });

  it("shows generic error for non-Error rejection", async () => {
    bulkEnrichMock.mockRejectedValueOnce("not an error");
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(mockToast.error).toHaveBeenCalledWith("Failed to start enrichment");
  });

  it("shows error toast when server function fails", async () => {
    bulkEnrichMock.mockRejectedValueOnce(new Error("Server error"));
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(mockToast.error).toHaveBeenCalled();
  });

  it("closes dialog when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} onOpenChange={onOpenChange} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("allows switching back to fullest strategy after selecting priority", async () => {
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 5 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Switch to priority
    const priorityRadio = screen.getByLabelText("Priority order");
    await user.click(priorityRadio);

    // Switch back to fullest
    const fullestRadio = screen.getByLabelText("Fullest data");
    await user.click(fullestRadio);

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(bulkEnrichMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ strategy: "fullest" }) as object,
    });
  });

  it("allows toggling a source off and back on", async () => {
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 5 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const gbCheckbox = screen.getByLabelText("Google Books");
    await user.click(gbCheckbox); // uncheck
    await user.click(gbCheckbox); // re-check (exercises add branch)

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(bulkEnrichMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sources: ["openlibrary", "googlebooks"],
      }) as object,
    });
  });

  it("allows selecting priority strategy", async () => {
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 5 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const priorityRadio = screen.getByLabelText("Priority order");
    await user.click(priorityRadio);

    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(bulkEnrichMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ strategy: "priority" }) as object,
    });
  });

  it("falls back to openlibrary when no sources are configured", async () => {
    integrationStatusMock.mockResolvedValue({
      openlibrary: { configured: false, label: "Open Library" },
      googlebooks: { configured: false, label: "Google Books" },
      hardcover: { configured: false, label: "Hardcover" },
    });
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 5 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Despite all being unconfigured, OL should still be in sources as fallback
    // All checkboxes are disabled, but the start button works with the fallback
    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(bulkEnrichMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sources: ["openlibrary"],
      }) as object,
    });
  });

  it("cancels pending fetch when dialog closes before load completes", async () => {
    let resolveStatus: ((v: Record<string, { configured: boolean; label: string }>) => void) | undefined;
    integrationStatusMock.mockImplementation(() => new Promise<Record<string, { configured: boolean; label: string }>>((r) => { resolveStatus = r; }));

    const { rerender } = render(<BulkEnrichDialog {...baseProps} />);

    // Close dialog before the fetch resolves
    rerender(<BulkEnrichDialog {...baseProps} open={false} />);

    // Now resolve — the cancelled flag should prevent state updates
    if (resolveStatus) resolveStatus({
      openlibrary: { configured: true, label: "Open Library" },
      googlebooks: { configured: true, label: "Google Books" },
      hardcover: { configured: true, label: "Hardcover" },
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // No crash, no state update — dialog is closed
    expect(screen.queryByText("Enrich 5 Works")).toBeFalsy();
  });

  it("does not render when open is false", () => {
    render(<BulkEnrichDialog {...baseProps} open={false} />);

    expect(screen.queryByText("Enrich 5 Works")).not.toBeTruthy();
  });

  it("includes all configured sources when pre-selected", async () => {
    integrationStatusMock.mockResolvedValue({
      openlibrary: { configured: true, label: "Open Library" },
      googlebooks: { configured: true, label: "Google Books" },
      hardcover: { configured: true, label: "Hardcover" },
    });
    bulkEnrichMock.mockResolvedValueOnce({ importJobId: "ij-1", enqueuedCount: 5 });
    const user = userEvent.setup();

    render(<BulkEnrichDialog {...baseProps} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // All 3 are configured and pre-selected
    const startBtn = screen.getByRole("button", { name: /Start Enrichment/i });
    await user.click(startBtn);

    expect(bulkEnrichMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sources: ["openlibrary", "googlebooks", "hardcover"],
      }) as object,
    });
  });
});
