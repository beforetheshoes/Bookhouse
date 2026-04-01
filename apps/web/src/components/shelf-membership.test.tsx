// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/server-fns/shelves", () => ({
  addEditionsForWorkToShelfServerFn: vi.fn(),
  removeWorkEditionsFromShelfServerFn: vi.fn(),
}));

import { addEditionsForWorkToShelfServerFn, removeWorkEditionsFromShelfServerFn } from "~/lib/server-fns/shelves";
import { ShelfMembership } from "./shelf-membership";

describe("ShelfMembership", () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(addEditionsForWorkToShelfServerFn).mockResolvedValue(undefined as never);
    vi.mocked(removeWorkEditionsFromShelfServerFn).mockResolvedValue(undefined as never);
  });

  it("shows 'No shelves created yet' when shelves is empty", () => {
    render(<ShelfMembership workId="w1" shelves={[]} onToggled={mockOnToggle} />);
    expect(screen.getByText("No shelves created yet")).toBeTruthy();
  });

  it("renders badges for each shelf", () => {
    const shelves = [
      { id: "s1", name: "Fiction", isMember: true },
      { id: "s2", name: "Non-Fiction", isMember: false },
    ];
    render(<ShelfMembership workId="w1" shelves={shelves} onToggled={mockOnToggle} />);
    expect(screen.getByText("Fiction")).toBeTruthy();
    expect(screen.getByText("Non-Fiction")).toBeTruthy();
  });

  it("calls removeWorkEditionsFromShelfServerFn when clicking a member shelf", async () => {
    const shelves = [{ id: "s1", name: "Fiction", isMember: true }];
    render(<ShelfMembership workId="w1" shelves={shelves} onToggled={mockOnToggle} />);
    fireEvent.click(screen.getByTestId("shelf-toggle-s1"));

    await waitFor(() => {
      expect(vi.mocked(removeWorkEditionsFromShelfServerFn)).toHaveBeenCalledWith({
        data: { shelfId: "s1", workId: "w1" },
      });
    });
    await waitFor(() => {
      expect(mockOnToggle).toHaveBeenCalled();
    });
  });

  it("calls addEditionsForWorkToShelfServerFn when clicking a non-member shelf", async () => {
    const shelves = [{ id: "s2", name: "Non-Fiction", isMember: false }];
    render(<ShelfMembership workId="w1" shelves={shelves} onToggled={mockOnToggle} />);
    fireEvent.click(screen.getByTestId("shelf-toggle-s2"));

    await waitFor(() => {
      expect(vi.mocked(addEditionsForWorkToShelfServerFn)).toHaveBeenCalledWith({
        data: { shelfId: "s2", workId: "w1" },
      });
    });
    await waitFor(() => {
      expect(mockOnToggle).toHaveBeenCalled();
    });
  });
});
