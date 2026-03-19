// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getColumnCount as _getColumnCount } from "./library-grid";

let mockVirtualizerArgs: { count: number };

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; getScrollElement: () => unknown; estimateSize: () => number; measureElement: (el: Element) => number }) => {
    mockVirtualizerArgs = opts;
    // Exercise callback branches for coverage
    opts.getScrollElement();
    opts.estimateSize();
    opts.measureElement({ getBoundingClientRect: () => ({ height: 400 }) } as unknown as Element);
    return {
      getVirtualItems: () =>
        opts.count > 0
          ? Array.from({ length: Math.min(opts.count, 5) }, (_, i) => ({
              index: i,
              start: i * 400,
              end: (i + 1) * 400,
            }))
          : [],
      getTotalSize: () => opts.count * 400,
      measureElement: vi.fn(),
    };
  },
}));

vi.mock("~/components/work-card", () => ({
  WorkCard: ({ title }: { title: string }) => <div data-testid="work-card">{title}</div>,
}));

const makeWork = (title: string, authors: string[] = [], enrichmentStatus = "ENRICHED") => ({
  id: title.toLowerCase().replace(/\s/g, "-"),
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  coverPath: null,
  createdAt: new Date("2025-01-01"),
  enrichmentStatus,
  series: null,
  editions: [
    {
      formatFamily: "EBOOK",
      publisher: "Test",
      isbn13: null,
      isbn10: null,
      contributors: authors.map((name) => ({
        role: "AUTHOR",
        contributor: { nameDisplay: name },
      })),
    },
  ],
});

describe("getColumnCount", () => {
  it("returns 2 for width < 480", () => {
    expect(_getColumnCount(400)).toBe(2);
  });

  it("returns 3 for width 480-639", () => {
    expect(_getColumnCount(500)).toBe(3);
  });

  it("returns 4 for width 640-1023", () => {
    expect(_getColumnCount(800)).toBe(4);
  });

  it("returns 5 for width 1024-1279", () => {
    expect(_getColumnCount(1100)).toBe(5);
  });

  it("returns 6 for width >= 1280", () => {
    expect(_getColumnCount(1400)).toBe(6);
  });
});

describe("LibraryGrid", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.callback = cb;
        }
        observe(el: Element) {
          this.callback(
            [{ contentRect: { width: 1200 }, target: el }] as unknown as ResizeObserverEntry[],
            this as unknown as ResizeObserver,
          );
        }
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("renders work cards", async () => {
    const { LibraryGrid } = await import("./library-grid");
    const works = [makeWork("Alpha", ["Author A"]), makeWork("Bravo", ["Author B"])];
    render(<LibraryGrid works={works as never[]} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("renders 'No results.' when works is empty", async () => {
    const { LibraryGrid } = await import("./library-grid");
    render(<LibraryGrid works={[]} />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });

  it("passes correct row count to virtualizer for partial last row", async () => {
    const { LibraryGrid } = await import("./library-grid");
    // With 1200px width => 5 columns, 7 works => ceil(7/5) = 2 rows
    const works = Array.from({ length: 7 }, (_, i) => makeWork(`Work ${String(i)}`));
    render(<LibraryGrid works={works as never[]} />);
    expect(mockVirtualizerArgs.count).toBe(2);
  });

  it("passes correct row count for exact fill", async () => {
    const { LibraryGrid } = await import("./library-grid");
    // 5 columns, 10 works => 2 rows
    const works = Array.from({ length: 10 }, (_, i) => makeWork(`Work ${String(i)}`));
    render(<LibraryGrid works={works as never[]} />);
    expect(mockVirtualizerArgs.count).toBe(2);
  });

  it("passes 0 rows for empty works", async () => {
    const { LibraryGrid } = await import("./library-grid");
    render(<LibraryGrid works={[]} />);
    expect(mockVirtualizerArgs.count).toBe(0);
  });

  it("renders correct number of cards in a virtual row", async () => {
    const { LibraryGrid } = await import("./library-grid");
    // 1200px => 5 cols, 3 works => 1 row with 3 cards
    const works = [makeWork("A"), makeWork("B"), makeWork("C")];
    render(<LibraryGrid works={works as never[]} />);
    const cards = screen.getAllByTestId("work-card");
    expect(cards).toHaveLength(3);
  });

  it("disconnects observer on unmount", async () => {
    const disconnectMock = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.callback = cb;
        }
        observe(el: Element) {
          this.callback(
            [{ contentRect: { width: 1200 }, target: el }] as unknown as ResizeObserverEntry[],
            this as unknown as ResizeObserver,
          );
        }
        unobserve = vi.fn();
        disconnect = disconnectMock;
      },
    );
    const { LibraryGrid } = await import("./library-grid");
    const { unmount } = render(<LibraryGrid works={[makeWork("Test")] as never[]} />);
    unmount();
    // Callback ref called with null on unmount disconnects the observer
    expect(disconnectMock).toHaveBeenCalled();
  });

  it("handles ResizeObserver with empty entries", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.callback = cb;
        }
        observe() {
          this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
        }
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    const { LibraryGrid } = await import("./library-grid");
    const works = [makeWork("Test")];
    render(<LibraryGrid works={works as never[]} />);
    expect(screen.getByText("Test")).toBeTruthy();
  });
});
