// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LibraryList, type LibraryListWork } from "./library-list";

let virtualCount = 0;
/** Makes the virtualiser hand back one index past the end of the array. */
let overrunVirtualItems = false;

vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: (opts: {
    count: number;
    estimateSize: () => number;
    scrollMargin: number;
  }) => {
    virtualCount = opts.count;
    opts.estimateSize();
    return {
      getVirtualItems: () =>
        Array.from({ length: overrunVirtualItems ? opts.count + 1 : Math.min(opts.count, 10) }, (_, i) => ({
          index: i,
          start: opts.scrollMargin + i * 88,
          end: opts.scrollMargin + (i + 1) * 88,
        })),
      getTotalSize: () => opts.count * 88,
      measureElement: vi.fn(),
    };
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params, to: _to, ...rest }: {
    children?: React.ReactNode;
    params?: { workId: string };
    to?: string;
    "data-testid"?: string;
    className?: string;
  }) => (
    <a href={`/library/${params?.workId ?? ""}`} {...rest}>{children}</a>
  ),
}));

type TestEdition = {
  formatFamily: string;
  publisher: string | null;
  isbn13: string | null;
  isbn10: string | null;
  contributors: { role: string; contributor: { nameDisplay: string } }[];
};

interface WorkOverrides {
  coverPath?: string | null;
  series?: { id: string; name: string } | null;
  editions?: TestEdition[];
}

const makeWork = (title: string, authors: string[] = ["Author A"], overrides: WorkOverrides = {}) => ({
  id: title.toLowerCase().replace(/\s/g, "-"),
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  coverPath: null,
  createdAt: new Date("2025-01-01"),
  enrichmentStatus: "ENRICHED",
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
  ...overrides,
});

const works = (...w: LibraryListWork[]) => w;

describe("LibraryList", () => {
  beforeEach(() => {
    virtualCount = 0;
    overrunVirtualItems = false;
  });

  it("renders a row per work with title, author and format", () => {
    render(<LibraryList works={works(makeWork("Alpha"), makeWork("Bravo"))} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getAllByText("Author A").length).toBe(2);
    expect(screen.getAllByText("EBOOK").length).toBe(2);
    expect(virtualCount).toBe(2);
  });

  it("falls back to an em dash when a work has no author", () => {
    render(<LibraryList works={works(makeWork("Anon", []))} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("de-duplicates formats and shows the series", () => {
    const work = makeWork("Series Book", ["Author A"], {
      series: { id: "s1", name: "The Expanse" },
      editions: [
        { formatFamily: "EBOOK", publisher: null, isbn13: null, isbn10: null, contributors: [] },
        { formatFamily: "EBOOK", publisher: null, isbn13: null, isbn10: null, contributors: [] },
        { formatFamily: "AUDIOBOOK", publisher: null, isbn13: null, isbn10: null, contributors: [] },
      ],
    });
    render(<LibraryList works={works(work)} />);
    expect(screen.getAllByText("EBOOK").length).toBe(1);
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
    expect(screen.getByText("The Expanse")).toBeTruthy();
  });

  it("links each row to the work when not selecting", () => {
    render(<LibraryList works={works(makeWork("Alpha"))} />);
    expect(screen.getByTestId("list-row-alpha").getAttribute("href")).toBe("/library/alpha");
  });

  it("renders a cover when one exists and falls back when it fails", () => {
    const { container } = render(
      <LibraryList works={works(makeWork("Covered", ["A"], { coverPath: "abc" }))} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // Keyed by work id, matching the grid and /api/covers/:workId/:size.
    expect(img?.getAttribute("src")).toBe("/api/covers/covered/thumb");
    if (img) fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows a progress bar only past zero", () => {
    const { container, rerender } = render(
      <LibraryList works={works(makeWork("Alpha"))} progressMap={{ alpha: 0 }} />,
    );
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    rerender(<LibraryList works={works(makeWork("Alpha"))} progressMap={{ alpha: 42 }} />);
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
  });

  it("toggles selection by click and by keyboard, never as a link", () => {
    const onToggleSelect = vi.fn();
    render(
      <LibraryList
        works={works(makeWork("Alpha"))}
        selectable
        rowSelection={{}}
        onToggleSelect={onToggleSelect}
      />,
    );
    const row = screen.getByRole("checkbox", { name: "Select Alpha" });
    expect(row.getAttribute("href")).toBeNull();
    expect(row.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: "Tab" });
    expect(onToggleSelect).toHaveBeenCalledTimes(3);
  });

  it("marks a selected row and shows its tick", () => {
    const { container } = render(
      <LibraryList
        works={works(makeWork("Alpha"))}
        selectable
        rowSelection={{ alpha: true }}
        onToggleSelect={vi.fn()}
      />,
    );
    const row = screen.getByRole("checkbox", { name: "Select Alpha" });
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector(".bg-primary")).toBeTruthy();
  });

  it("leaves clearance for the bulk bar only while a selection stands", () => {
    const { container, rerender } = render(<LibraryList works={works(makeWork("Alpha"))} />);
    expect(container.firstElementChild?.className).not.toContain("pb-48");
    rerender(<LibraryList works={works(makeWork("Alpha"))} selectionActive />);
    expect(container.firstElementChild?.className).toContain("pb-48");
  });

  it("asks for another page as the end of the loaded rows comes into view", async () => {
    const onLoadMore = vi.fn();
    render(
      <LibraryList
        works={works(makeWork("Alpha"), makeWork("Bravo"))}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    await waitFor(() => { expect(onLoadMore).toHaveBeenCalled(); });
  });

  it("does not ask again while a page is already loading", () => {
    const onLoadMore = vi.fn();
    render(
      <LibraryList
        works={works(makeWork("Alpha"))}
        hasMore
        loadingMore
        onLoadMore={onLoadMore}
      />,
    );
    expect(onLoadMore).not.toHaveBeenCalled();
    expect(screen.getByTestId("library-list-loading")).toBeTruthy();
  });

  it("does not ask when there is nothing more, no handler, or nothing loaded", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <LibraryList works={works(makeWork("Alpha"))} hasMore={false} onLoadMore={onLoadMore} />,
    );
    rerender(<LibraryList works={works(makeWork("Alpha"))} hasMore />);
    rerender(<LibraryList works={works()} hasMore onLoadMore={onLoadMore} />);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("holds off while the visible rows are still far from the end", () => {
    // Ten rows rendered out of twenty loaded: nothing should be fetched until
    // the reader is within six of the last one.
    const onLoadMore = vi.fn();
    const many = Array.from({ length: 20 }, (_, i) => makeWork(`Work ${String(i)}`));
    render(<LibraryList works={works(...many)} hasMore onLoadMore={onLoadMore} />);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("skips a virtual index the loaded page does not reach", () => {
    overrunVirtualItems = true;
    render(<LibraryList works={works(makeWork("Alpha"))} />);
    expect(screen.getAllByText("Alpha").length).toBe(1);
  });

  it("stops measuring once the list unmounts", () => {
    const { unmount } = render(<LibraryList works={works(makeWork("Alpha"))} />);
    unmount();
    fireEvent(window, new Event("resize"));
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("re-measures its document offset when the window resizes", () => {
    render(<LibraryList works={works(makeWork("Alpha"))} />);
    fireEvent(window, new Event("resize"));
    expect(screen.getByText("Alpha")).toBeTruthy();
  });
});
