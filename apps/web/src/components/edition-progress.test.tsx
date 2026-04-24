// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/components/progress-bar", () => ({
  ProgressBar: ({ percent }: { percent: number }) => (
    <div data-testid="progress-bar" data-percent={percent} />
  ),
}));

import { EditionProgress, progressKindForEdition } from "./edition-progress";

type Editions = Parameters<typeof EditionProgress>[0]["editions"];

/** Cast test data to the Editions type without going through `unknown` */
function asEditions(data: object[]): Editions {
  return data as Editions & object[];
}

describe("progressKindForEdition", () => {
  it("returns AUDIO for AUDIOBOOK", () => {
    expect(progressKindForEdition("AUDIOBOOK")).toBe("AUDIO");
  });

  it("returns EBOOK for other formats", () => {
    expect(progressKindForEdition("EBOOK")).toBe("EBOOK");
    expect(progressKindForEdition("PDF")).toBe("EBOOK");
  });
});

describe("EditionProgress", () => {
  const mockOnUpdate = vi.fn();

  const editions = asEditions([
    {
      id: "e1",
      formatFamily: "EBOOK",
      publisher: null,
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      language: null,
      pageCount: null,
      editedFields: [],
      contributors: [],
      editionFiles: [],
    },
  ]);

  const progress = [
    { editionId: "e1", progressKind: "EBOOK", percent: 42, source: "Kobo" as string | null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnUpdate.mockResolvedValue(undefined);
  });

  it("renders progress bar for each edition", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    expect(screen.getAllByTestId("progress-bar").length).toBeGreaterThan(0);
  });

  it("renders format badge", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    expect(screen.getAllByText("EBOOK").length).toBeGreaterThan(0);
  });

  it("renders source badge", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    expect(screen.getByText(/via\s+kobo/i)).toBeTruthy();
  });

  it("does not render source badge when source is null", () => {
    const noSourceProgress = [{ editionId: "e1", progressKind: "EBOOK", percent: 42, source: null }];
    render(<EditionProgress progress={noSourceProgress} editions={editions} onUpdate={mockOnUpdate} />);
    expect(screen.queryByText(/via/)).toBeNull();
  });

  it("shows edit input when clicking percentage", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    expect(screen.getByTestId("progress-input-e1")).toBeTruthy();
  });

  it("calls onUpdate when saving valid value", async () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    const input = screen.getByTestId("progress-input-e1");
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.click(screen.getByTestId("progress-save-e1"));

    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith("e1", 75, "EBOOK");
    });
  });

  it("calls onUpdate on Enter key", async () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    const input = screen.getByTestId("progress-input-e1");
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith("e1", 50, "EBOOK");
    });
  });

  it("cancels editing on Escape", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    const input = screen.getByTestId("progress-input-e1");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("progress-input-e1")).toBeNull();
  });

  it("cancels editing when cancel button is clicked", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    fireEvent.click(screen.getByTestId("progress-cancel-e1"));
    expect(screen.queryByTestId("progress-input-e1")).toBeNull();
  });

  it("does not call onUpdate for invalid values", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    const input = screen.getByTestId("progress-input-e1");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("progress-save-e1"));
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it("does not call onUpdate for values > 100", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    const input = screen.getByTestId("progress-input-e1");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByTestId("progress-save-e1"));
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it("does not call onUpdate for negative values", () => {
    render(<EditionProgress progress={progress} editions={editions} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByTestId("progress-edit-e1"));
    const input = screen.getByTestId("progress-input-e1");
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.click(screen.getByTestId("progress-save-e1"));
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it("uses progressKindForEdition when no progress exists for edition", () => {
    const audioEditions = asEditions([{
      id: "e-audio",
      formatFamily: "AUDIOBOOK",
      publisher: null,
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      language: null,
      pageCount: null,
      editedFields: [],
      contributors: [],
      editionFiles: [],
    }]);
    render(<EditionProgress progress={[]} editions={audioEditions} onUpdate={mockOnUpdate} />);
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
  });

  it("renders separate rows for multiple sources on the same edition", () => {
    const multiSourceProgress = [
      { editionId: "e1", progressKind: "EBOOK", percent: 42, source: "manual" as string | null },
      { editionId: "e1", progressKind: "EBOOK", percent: 65, source: "koreader" as string | null },
    ];

    render(<EditionProgress progress={multiSourceProgress} editions={editions} onUpdate={mockOnUpdate} />);

    expect(screen.getByText(/via\s+manual/i)).toBeTruthy();
    expect(screen.getByText(/via\s+koreader/i)).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("65%")).toBeTruthy();
  });
});
