// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { SplitEditionDialog } from "./split-edition-dialog";

const baseFiles = [
  { id: "ef1", fileAsset: { basename: "part1.m4b", mediaKind: "AUDIO", sizeBytes: BigInt(50000000) } },
  { id: "ef2", fileAsset: { basename: "part2.m4b", mediaKind: "AUDIO", sizeBytes: BigInt(60000000) } },
  { id: "ef3", fileAsset: { basename: "part3.m4b", mediaKind: "AUDIO", sizeBytes: BigInt(45000000) } },
];

describe("SplitEditionDialog", () => {
  it("renders nothing when not open", () => {
    const { container } = render(
      <SplitEditionDialog
        open={false}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders file list with checkboxes when open", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getByText("part1.m4b")).toBeTruthy();
    expect(screen.getByText("part2.m4b")).toBeTruthy();
    expect(screen.getByText("part3.m4b")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("disables confirm when no files selected", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: "Split" });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
  });

  it("disables confirm when all files selected and shows warning", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    const confirmBtn = screen.getByRole("button", { name: "Split" });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/must leave at least one file/)).toBeTruthy();
  });

  it("enables confirm when a subset is selected", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1] as HTMLElement);
    const confirmBtn = screen.getByRole("button", { name: "Split" });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
  });

  it("calls onConfirm with selected file IDs", () => {
    const onConfirm = vi.fn();
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={onConfirm}
        confirming={false}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole("checkbox")[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(onConfirm).toHaveBeenCalledWith(["ef1", "ef3"]);
  });

  it("shows file size for each file", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getByText("47.7 MB")).toBeTruthy();
    expect(screen.getByText("57.2 MB")).toBeTruthy();
    expect(screen.getByText("42.9 MB")).toBeTruthy();
  });

  it("disables buttons when confirming", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={true}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    const confirmBtn = screen.getByRole("button", { name: "Splitting..." });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
  });

  it("shows media kind badge", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getAllByText("AUDIO")).toHaveLength(3);
  });

  it("allows deselecting a file by clicking again", () => {
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0] as HTMLElement);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkboxes[0] as HTMLElement);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
  });

  it("calls onOpenChange(false) when cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={onOpenChange}
        editionFiles={baseFiles}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("formats small bytes correctly", () => {
    const files = [
      { id: "ef1", fileAsset: { basename: "a.txt", mediaKind: "EPUB", sizeBytes: BigInt(512) } },
      { id: "ef2", fileAsset: { basename: "b.txt", mediaKind: "EPUB", sizeBytes: BigInt(5000) } },
    ];
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={files}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getByText("512 B")).toBeTruthy();
    expect(screen.getByText("4.9 KB")).toBeTruthy();
  });

  it("handles null sizeBytes gracefully", () => {
    const files = [
      { id: "ef1", fileAsset: { basename: "a.epub", mediaKind: "EPUB", sizeBytes: null } },
      { id: "ef2", fileAsset: { basename: "b.epub", mediaKind: "EPUB", sizeBytes: null } },
    ];
    render(
      <SplitEditionDialog
        open={true}
        onOpenChange={vi.fn()}
        editionFiles={files}
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getByText("a.epub")).toBeTruthy();
  });
});
