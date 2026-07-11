// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GlobalUploadDrop } from "./global-upload-drop";

function fileDragPayload(files: File[] = []): { dataTransfer: { types: string[]; files: File[] } } {
  return { dataTransfer: { types: ["Files"], files } };
}

describe("GlobalUploadDrop", () => {
  it("shows the overlay while files are dragged over the window and hides it on leave", () => {
    const { unmount } = render(<GlobalUploadDrop enabled onFilesDropped={vi.fn()} />);

    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    fireEvent.dragEnter(window, fileDragPayload());
    expect(screen.getByTestId("global-drop-overlay")).toBeTruthy();

    fireEvent.dragLeave(window, fileDragPayload());
    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    unmount();
  });

  it("keeps the overlay up while moving across nested elements", () => {
    const { unmount } = render(<GlobalUploadDrop enabled onFilesDropped={vi.fn()} />);

    fireEvent.dragEnter(window, fileDragPayload());
    fireEvent.dragEnter(window, fileDragPayload()); // entered a child
    fireEvent.dragLeave(window, fileDragPayload()); // left the child
    expect(screen.getByTestId("global-drop-overlay")).toBeTruthy();
    unmount();
  });

  it("delivers dropped files and hides the overlay", () => {
    const onFilesDropped = vi.fn();
    const { unmount } = render(<GlobalUploadDrop enabled onFilesDropped={onFilesDropped} />);

    const file = new File(["x"], "dropped.epub");
    fireEvent.dragEnter(window, fileDragPayload());
    fireEvent.dragOver(window, fileDragPayload());
    fireEvent.drop(window, fileDragPayload([file]));

    expect(onFilesDropped).toHaveBeenCalledWith([file]);
    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    unmount();
  });

  it("ignores drops that contain no files", () => {
    const onFilesDropped = vi.fn();
    const { unmount } = render(<GlobalUploadDrop enabled onFilesDropped={onFilesDropped} />);

    fireEvent.dragEnter(window, fileDragPayload());
    fireEvent.drop(window, fileDragPayload([]));
    expect(onFilesDropped).not.toHaveBeenCalled();
    unmount();
  });

  it("ignores drags that are not files (text selections, etc.)", () => {
    const { unmount } = render(<GlobalUploadDrop enabled onFilesDropped={vi.fn()} />);

    fireEvent.dragEnter(window, { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    fireEvent.dragOver(window, { dataTransfer: { types: ["text/plain"], files: [] } });
    fireEvent.dragLeave(window, { dataTransfer: { types: ["text/plain"], files: [] } });
    fireEvent.drop(window, { dataTransfer: { types: ["text/plain"], files: [] } });
    unmount();
  });

  it("handles drag events with no dataTransfer at all", () => {
    const onFilesDropped = vi.fn();
    const { unmount } = render(<GlobalUploadDrop enabled onFilesDropped={onFilesDropped} />);

    fireEvent.dragEnter(window);
    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    fireEvent.drop(window);
    expect(onFilesDropped).not.toHaveBeenCalled();
    unmount();
  });

  it("does nothing when disabled", () => {
    const onFilesDropped = vi.fn();
    const { unmount } = render(
      <GlobalUploadDrop enabled={false} onFilesDropped={onFilesDropped} />,
    );

    fireEvent.dragEnter(window, fileDragPayload());
    expect(screen.queryByTestId("global-drop-overlay")).toBeNull();
    fireEvent.drop(window, fileDragPayload([new File(["x"], "n.epub")]));
    expect(onFilesDropped).not.toHaveBeenCalled();
    unmount();
  });
});
