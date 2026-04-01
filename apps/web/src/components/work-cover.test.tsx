// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [k: string]: string | React.ReactNode | (() => void) | undefined }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

import { toast } from "sonner";
import { WorkCover } from "./work-cover";

const defaultProps = {
  workId: "w1",
  coverPath: "/covers/w1" as string | null,
  titleDisplay: "Test Book",
  maxPercent: null as number | null,
  coverVersion: 0,
  onCoverUpdated: vi.fn(),
  onCoverSearchOpen: vi.fn(),
};

describe("WorkCover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders image when coverPath exists", () => {
    render(<WorkCover {...defaultProps} />);
    const img = screen.getByAltText("Test Book");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/api/covers/w1/medium?v=0");
  });

  it("renders placeholder when coverPath is null", () => {
    render(<WorkCover {...defaultProps} coverPath={null} />);
    expect(screen.getByTestId("cover-placeholder")).toBeTruthy();
  });

  it("falls back to placeholder on image error", () => {
    render(<WorkCover {...defaultProps} />);
    const img = screen.getByAltText("Test Book");
    fireEvent.error(img);
    expect(screen.getByTestId("cover-placeholder")).toBeTruthy();
  });

  it("shows maxPercent when not null", () => {
    render(<WorkCover {...defaultProps} maxPercent={75} />);
    expect(screen.getByTestId("cover-progress")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("does not show progress when maxPercent is null", () => {
    render(<WorkCover {...defaultProps} maxPercent={null} />);
    expect(screen.queryByTestId("cover-progress")).toBeNull();
  });

  it("calls onCoverUpdated after successful upload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    const onCoverUpdated = vi.fn();
    render(<WorkCover {...defaultProps} onCoverUpdated={onCoverUpdated} />);

    const fileInput = screen.getByTestId("cover-file-input");
    const file = new File(["data"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/upload-cover/w1",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(onCoverUpdated).toHaveBeenCalled();
    });
    expect(vi.mocked(toast).success).toHaveBeenCalledWith("Cover updated");
  });

  it("shows error toast on failed upload", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve("Bad file") });
    render(<WorkCover {...defaultProps} />);

    const fileInput = screen.getByTestId("cover-file-input");
    const file = new File(["data"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(vi.mocked(toast).error).toHaveBeenCalledWith("Bad file");
    });
  });

  it("shows generic error toast on upload exception", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<WorkCover {...defaultProps} />);

    const fileInput = screen.getByTestId("cover-file-input");
    const file = new File(["data"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(vi.mocked(toast).error).toHaveBeenCalledWith("Network error");
    });
  });

  it("does nothing when no file selected", () => {
    render(<WorkCover {...defaultProps} />);
    const fileInput = screen.getByTestId("cover-file-input");
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls onCoverSearchOpen when search option is used", () => {
    const onCoverSearchOpen = vi.fn();
    render(<WorkCover {...defaultProps} onCoverSearchOpen={onCoverSearchOpen} />);
    fireEvent.click(screen.getByTestId("cover-search-option"));
    expect(onCoverSearchOpen).toHaveBeenCalled();
  });
});
