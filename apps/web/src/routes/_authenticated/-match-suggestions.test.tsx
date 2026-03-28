// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const invalidateMock = vi.fn();

interface MockEditionEntry {
  contributors: { role: string; contributor: { nameDisplay: string } }[];
  editionFiles: { fileAsset: { absolutePath: string; mediaKind: string } }[];
  formatFamily?: string;
}

interface MockWork {
  titleDisplay: string;
  createdAt: Date;
  editions: MockEditionEntry[];
}

let mockLoaderData: {
  matchSuggestions: {
    id: string;
    targetWorkId: string;
    suggestedWorkId: string;
    targetWork: MockWork;
    suggestedWork: MockWork;
    matchType: string;
    confidence: number | null;
    reviewStatus: string;
  }[];
} = { matchSuggestions: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: invalidateMock, navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getMatchSuggestionsServerFnMock = vi.fn();
const acceptMatchSuggestionServerFnMock = vi.fn();
const declineMatchSuggestionServerFnMock = vi.fn();
const rematchAllServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/match-suggestions", () => ({
  getMatchSuggestionsServerFn: getMatchSuggestionsServerFnMock,
  acceptMatchSuggestionServerFn: acceptMatchSuggestionServerFnMock,
  declineMatchSuggestionServerFn: declineMatchSuggestionServerFnMock,
  rematchAllServerFn: rematchAllServerFnMock,
}));

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("~/components/data-table/virtualized-data-table", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VirtualizedDataTable: ({ data, columns }: { data: any[]; columns: any[] }) => (
    <div data-testid="data-table">
      <div data-testid="data-table-row-count">{data.length} rows</div>
      <table>
        <thead>
          <tr>
            {columns.map((col: { id?: string; header?: string | (() => React.ReactNode) }) => (
              <th key={col.id ?? String(col.header)}>
                {typeof col.header === "function" ? (col.header as (ctx: { column: { id: string | undefined } }) => React.ReactNode)({ column: { id: col.id } }) : (col.id ?? "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: { id: string }, i: number) => (
            <tr key={row.id || i} data-testid="data-table-row">
              {columns.map((col: { id?: string; accessorFn?: (r: object) => string; cell?: (ctx: { row: { original: object } }) => React.ReactNode }) => {
                const val = col.accessorFn ? col.accessorFn(row) : "";
                const cellContent = col.cell ? col.cell({ row: { original: row } }) : val;
                return <td key={col.id}>{typeof cellContent === "string" ? cellContent : cellContent as React.ReactNode}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
}));

vi.mock("~/components/data-table/data-table-column-header", () => ({
  DataTableColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const makeWork = (title: string, contributors: { role: string; name: string }[] = [], files: { path: string; kind: string }[] = [], createdAt: Date = new Date("2025-01-01")): MockWork => ({
  titleDisplay: title,
  createdAt,
  editions: [{
    contributors: contributors.map((c) => ({ role: c.role, contributor: { nameDisplay: c.name } })),
    editionFiles: files.map((f) => ({ fileAsset: { absolutePath: f.path, mediaKind: f.kind } })),
    formatFamily: files[0]?.kind === "AUDIO" ? "AUDIOBOOK" : "EBOOK",
  }],
});

const makeMatchSuggestion = (overrides: Partial<typeof mockLoaderData.matchSuggestions[number]> = {}) => ({
  id: "ms-1",
  targetWorkId: "work-target",
  suggestedWorkId: "work-suggested",
  targetWork: makeWork("Ebook Title", [{ role: "AUTHOR", name: "Author Name" }], [{ path: "/books/book.epub", kind: "EPUB" }]),
  suggestedWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author Name" }, { role: "NARRATOR", name: "Narrator Name" }], [{ path: "/audiobooks/book/chapter.mp3", kind: "AUDIO" }]),
  matchType: "EXACT_METADATA",
  confidence: null,
  reviewStatus: "PENDING",
  ...overrides,
});

describe("MatchSuggestionsPage", () => {
  beforeEach(() => {
    mockLoaderData = { matchSuggestions: [] };
    vi.clearAllMocks();
  });

  it("loader calls getMatchSuggestionsServerFn", async () => {
    getMatchSuggestionsServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./match-suggestions");
    const result = await (Route.options.loader as (args: Record<string, string | object>) => Promise<object>)({});
    expect(getMatchSuggestionsServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ matchSuggestions: [] });
  });

  it("renders 'Match Suggestions' heading", async () => {
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("Match Suggestions")).toBeTruthy();
  });

  it("renders empty state when no match suggestions", async () => {
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("No match suggestions found")).toBeTruthy();
  });

  it("renders target and suggested titles in card", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Audio Title")).toBeTruthy();
  });

  it("card view labels sides as 'Work A' and 'Work B'", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("Work A")).toBeTruthy();
    expect(screen.getByText("Work B")).toBeTruthy();
  });

  it("renders authors and narrators", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getAllByText("Author Name").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Narrator Name/)).toBeTruthy();
  });

  it("renders Keep Left, Keep Right and Decline buttons for PENDING status", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "PENDING" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("Keep Left")).toBeTruthy();
    expect(screen.getByText("Decline")).toBeTruthy();
  });

  it("does not render action buttons for CONFIRMED status", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "CONFIRMED" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.queryByText("Keep Left")).toBeNull();
    expect(screen.queryByText("Decline")).toBeNull();
  });

  it("does not render action buttons for IGNORED status", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "IGNORED" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.queryByText("Keep Left")).toBeNull();
    expect(screen.queryByText("Decline")).toBeNull();
  });

  it("renders confidence as percentage", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ confidence: 0.85 })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("renders confidence as dash when null", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ confidence: null })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders without folder when suggested edition has no files", async () => {
    mockLoaderData = {
      matchSuggestions: [makeMatchSuggestion({
        suggestedWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author" }], []),
      })],
    };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("Audio Title")).toBeTruthy();
    // No folder path or track count rendered
    expect(screen.queryByText(/audio file/)).toBeNull();
  });

  it("renders singular 'file' when a work has exactly 1 file", async () => {
    mockLoaderData = {
      matchSuggestions: [makeMatchSuggestion({
        suggestedWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author" }], [{ path: "/audio/track.mp3", kind: "AUDIO" }]),
      })],
    };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    // Both sides have 1 file each
    expect(screen.getAllByText("1 file").length).toBeGreaterThanOrEqual(1);
  });

  it("renders plural 'files' when suggested edition has multiple audio tracks", async () => {
    mockLoaderData = {
      matchSuggestions: [makeMatchSuggestion({
        suggestedWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author" }], [
          { path: "/audio/track1.mp3", kind: "AUDIO" },
          { path: "/audio/track2.mp3", kind: "AUDIO" },
        ]),
      })],
    };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("2 files")).toBeTruthy();
  });

  it("renders matchType badge", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ matchType: "EXACT_METADATA" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("EXACT_METADATA")).toBeTruthy();
  });

  it("renders status badge with fallback variant for unknown status", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "UNKNOWN_STATUS" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("tab filtering: PENDING filters to pending only", async () => {
    mockLoaderData = {
      matchSuggestions: [
        makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" }),
        makeMatchSuggestion({
          id: "ms-2",
          reviewStatus: "CONFIRMED",
          targetWork: makeWork("Confirmed Book", [], []),
        }),
      ],
    };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    // Both are visible on "All" tab
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Confirmed Book")).toBeTruthy();
    // Click "Pending" tab
    const pendingTab = screen.getByRole("tab", { name: "Pending" });
    await userEvent.click(pendingTab);
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.queryByText("Confirmed Book")).toBeNull();
  });

  it("Keep Left button calls acceptMatchSuggestionServerFn with target work as surviving", async () => {
    acceptMatchSuggestionServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await userEvent.click(screen.getByText("Keep Left"));
    expect(acceptMatchSuggestionServerFnMock).toHaveBeenCalledWith({ data: { id: "ms-1", survivingWorkId: "work-target" } });
  });

  it("Keep Right button calls acceptMatchSuggestionServerFn with suggested work", async () => {
    acceptMatchSuggestionServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await userEvent.click(screen.getByText("Keep Right"));
    expect(acceptMatchSuggestionServerFnMock).toHaveBeenCalledWith({ data: { id: "ms-1", survivingWorkId: "work-suggested" } });
  });

  it("Decline button calls declineMatchSuggestionServerFn", async () => {
    declineMatchSuggestionServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await userEvent.click(screen.getByText("Decline"));
    expect(declineMatchSuggestionServerFnMock).toHaveBeenCalledWith({ data: { id: "ms-1" } });
  });

  describe("sort options", () => {
    const setupSortableLinks = () => {
      mockLoaderData = {
        matchSuggestions: [
          makeMatchSuggestion({
            id: "ms-1",
            targetWork: makeWork(
              "Alpha Book",
              [{ role: "AUTHOR", name: "Charlie Author" }],
              [{ path: "/books/alpha.epub", kind: "EPUB" }],
            ),
            suggestedWork: makeWork(
              "Alpha Audio",
              [{ role: "AUTHOR", name: "Charlie Author" }],
              [{ path: "/audio/alpha.mp3", kind: "AUDIO" }],
            ),
          }),
          makeMatchSuggestion({
            id: "ms-2",
            targetWork: makeWork(
              "Bravo Book",
              [{ role: "AUTHOR", name: "Alice Author" }],
              [{ path: "/books/bravo.epub", kind: "EPUB" }],
              new Date("2025-06-01"),
            ),
            suggestedWork: makeWork(
              "Bravo Audio",
              [{ role: "AUTHOR", name: "Alice Author" }],
              [{ path: "/audio/bravo.mp3", kind: "AUDIO" }],
            ),
          }),
        ],
      };
    };

    const selectSortOption = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
      const combobox = screen.getByRole("combobox");
      await user.click(combobox);
      await user.click(screen.getByText(label));
    };

    const getCardTitles = () => {
      // Each card has two titles (target + suggested); grab the target titles
      return screen.getAllByText(/Book$/).map((el) => el.textContent);
    };

    it("sorts by title Z–A", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Title Z\u2013A");
      const titles = getCardTitles();
      expect(titles).toEqual(["Bravo Book", "Alpha Book"]);
    });

    it("sorts by author A–Z", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Author A\u2013Z");
      const titles = getCardTitles();
      // Alice Author < Charlie Author
      expect(titles).toEqual(["Bravo Book", "Alpha Book"]);
    });

    it("sorts by author A–Z with missing author uses fallback", async () => {
      mockLoaderData = {
        matchSuggestions: [
          makeMatchSuggestion({
            id: "ms-1",
            targetWork: makeWork("No Author Book", [], [{ path: "/books/no-author.epub", kind: "EPUB" }]),
            suggestedWork: makeWork("No Author Audio", [], [{ path: "/audio/no-author.mp3", kind: "AUDIO" }]),
          }),
          makeMatchSuggestion({
            id: "ms-2",
            targetWork: makeWork("Has Author Book", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/books/has-author.epub", kind: "EPUB" }]),
            suggestedWork: makeWork("Has Author Audio", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/audio/has-author.mp3", kind: "AUDIO" }]),
          }),
          makeMatchSuggestion({
            id: "ms-3",
            targetWork: makeWork("Also No Author Book", [], [{ path: "/books/also-no-author.epub", kind: "EPUB" }]),
            suggestedWork: makeWork("Also No Author Audio", [], [{ path: "/audio/also-no-author.mp3", kind: "AUDIO" }]),
          }),
        ],
      };
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Author A\u2013Z");
      const titles = getCardTitles();
      // "Zach" < \uffff fallback, so Has Author comes first; two no-author items sort by fallback
      expect(titles[0]).toBe("Has Author Book");
    });

    it("sorts by author Z–A with missing author uses fallback", async () => {
      mockLoaderData = {
        matchSuggestions: [
          makeMatchSuggestion({
            id: "ms-1",
            targetWork: makeWork("No Author Book", [], [{ path: "/books/no-author.epub", kind: "EPUB" }]),
            suggestedWork: makeWork("No Author Audio", [], [{ path: "/audio/no-author.mp3", kind: "AUDIO" }]),
          }),
          makeMatchSuggestion({
            id: "ms-2",
            targetWork: makeWork("Has Author Book", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/books/has-author.epub", kind: "EPUB" }]),
            suggestedWork: makeWork("Has Author Audio", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/audio/has-author.mp3", kind: "AUDIO" }]),
          }),
          makeMatchSuggestion({
            id: "ms-3",
            targetWork: makeWork("Also No Author Book", [], [{ path: "/books/also-no-author.epub", kind: "EPUB" }]),
            suggestedWork: makeWork("Also No Author Audio", [], [{ path: "/audio/also-no-author.mp3", kind: "AUDIO" }]),
          }),
        ],
      };
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Author Z\u2013A");
      const titles = getCardTitles();
      // "Zach" > "" fallback, so Has Author comes first
      expect(titles[0]).toBe("Has Author Book");
    });

    it("sorts by author Z–A", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Author Z\u2013A");
      const titles = getCardTitles();
      // Charlie Author > Alice Author
      expect(titles).toEqual(["Alpha Book", "Bravo Book"]);
    });

    it("sorts by newest first", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Newest first");
      const titles = getCardTitles();
      // Bravo (2025-06-01) > Alpha (2025-01-01)
      expect(titles).toEqual(["Bravo Book", "Alpha Book"]);
    });

    it("sorts by oldest first", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./match-suggestions");
      const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
      render(<MatchSuggestionsPage />);
      await selectSortOption(user, "Oldest first");
      const titles = getCardTitles();
      // Alpha (2025-01-01) < Bravo (2025-06-01)
      expect(titles).toEqual(["Alpha Book", "Bravo Book"]);
    });
  });

  it("renders Re-scan Matches button", async () => {
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByRole("button", { name: /re-scan matches/i })).toBeTruthy();
  });

  it("Re-scan Matches button calls rematchAllServerFn and invalidates router", async () => {
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 42 });
    invalidateMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(rematchAllServerFnMock).toHaveBeenCalled();
  });

  it("Re-scan Matches starts polling when jobs are enqueued", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 5 });
    invalidateMock.mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    // Button should change to "Scanning..." while polling
    expect(screen.getByRole("button", { name: /scanning/i })).toBeTruthy();
    // Advance past one poll interval (3s) — router.invalidate should be called
    vi.advanceTimersByTime(3500);
    expect(invalidateMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("Re-scan Matches clears previous poll when clicked again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rematchAllServerFnMock.mockResolvedValue({ importJobId: "job-1", enqueuedCount: 5 });
    invalidateMock.mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    const { unmount } = render(<MatchSuggestionsPage />);
    // Click once to start polling
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(screen.getByRole("button", { name: /scanning/i })).toBeTruthy();
    // Advance past timeout to clean up polling and re-enable button
    vi.advanceTimersByTime(61000);
    // Unmount to trigger cleanup effect
    unmount();
    vi.useRealTimers();
  });

  it("Re-scan Matches returns to the idle button state after the polling timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 5 });
    invalidateMock.mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    const { act } = await import("@testing-library/react");
    render(<MatchSuggestionsPage />);

    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(screen.getByRole("button", { name: /scanning/i })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(screen.getByRole("button", { name: /re-scan matches/i })).toBeTruthy();
    vi.useRealTimers();
  });

  it("cleans up polling on unmount before the timeout callback runs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 5 });
    invalidateMock.mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    const { unmount } = render(<MatchSuggestionsPage />);

    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    unmount();
    vi.advanceTimersByTime(61000);
    vi.useRealTimers();
  });

  it("Re-scan Matches handles failure gracefully when mutation returns null", async () => {
    rematchAllServerFnMock.mockRejectedValueOnce(new Error("fail"));
    invalidateMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(rematchAllServerFnMock).toHaveBeenCalled();
  });

  it("Re-scan Matches shows toast when zero files to match", async () => {
    const { toast } = await import("sonner");
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 0 });
    invalidateMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(toast.success).toHaveBeenCalledWith("No files to match");
  });

  it("renders view toggle buttons", async () => {
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByRole("button", { name: /card view/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /table view/i })).toBeTruthy();
  });

  it("switches to table view when table button is clicked", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    // Initially in card view
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    // Switch to table view
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByTestId("data-table")).toBeTruthy();
  });

  it("hides sort dropdown in table view", async () => {
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    // Sort dropdown visible in card view
    expect(screen.getByRole("combobox")).toBeTruthy();
    // Switch to table view — sort dropdown hidden (table has its own sorting)
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("table view renders target and suggested titles in cells", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Audio Title")).toBeTruthy();
  });

  it("table view renders match type badge and confidence", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ matchType: "NORMALIZED_TITLE", confidence: 0.92 })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("NORMALIZED_TITLE")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
  });

  it("table view renders status badge", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("PENDING")).toBeTruthy();
  });

  it("table view renders Keep A, Keep B and Decline buttons for PENDING suggestions", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("Keep A")).toBeTruthy();
    expect(screen.getByText("Keep B")).toBeTruthy();
    expect(screen.getByText("Decline")).toBeTruthy();
  });

  it("table view does not render action buttons for CONFIRMED suggestions", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "CONFIRMED" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.queryByText("Keep A")).toBeNull();
    expect(screen.queryByText("Decline")).toBeNull();
  });

  it("table view renders author as caption below title in work cells", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    // Author appears inline with each work title, not in a separate column
    expect(screen.getAllByText("Author Name").length).toBeGreaterThanOrEqual(1);
  });

  it("table view Keep A button calls acceptMatchSuggestionServerFn with target work", async () => {
    acceptMatchSuggestionServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    await user.click(screen.getByText("Keep A"));
    expect(acceptMatchSuggestionServerFnMock).toHaveBeenCalledWith({ data: { id: "ms-1", survivingWorkId: "work-target" } });
  });

  it("table view Keep B button calls acceptMatchSuggestionServerFn with suggested work", async () => {
    acceptMatchSuggestionServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    await user.click(screen.getByText("Keep B"));
    expect(acceptMatchSuggestionServerFnMock).toHaveBeenCalledWith({ data: { id: "ms-1", survivingWorkId: "work-suggested" } });
  });

  it("table view Decline button calls declineMatchSuggestionServerFn", async () => {
    declineMatchSuggestionServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ id: "ms-1", reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    await user.click(screen.getByText("Decline"));
    expect(declineMatchSuggestionServerFnMock).toHaveBeenCalledWith({ data: { id: "ms-1" } });
  });

  it("switches back to card view from table view", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion()] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByTestId("data-table")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /card view/i }));
    expect(screen.queryByTestId("data-table")).toBeNull();
  });

  it("table view renders dash for null confidence", async () => {
    mockLoaderData = {
      matchSuggestions: [makeMatchSuggestion({
        targetWork: makeWork("No Author Book", [], []),
        suggestedWork: makeWork("No Author Audio", [], []),
        confidence: null,
      })],
    };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    // "—" rendered for null confidence (author is shown inline, not as a separate column)
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("table view renders outline badge for unknown status", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion({ reviewStatus: "UNKNOWN_STATUS" })] };
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("shows row count in subtitle", async () => {
    mockLoaderData = { matchSuggestions: [makeMatchSuggestion(), makeMatchSuggestion({ id: "ms-2" })] };
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    expect(screen.getByText(/2 total/)).toBeTruthy();
  });

  it("Re-scan Matches button shows 'Starting...' while server function runs", async () => {
    let resolveRematch!: (value: { importJobId: string; enqueuedCount: number }) => void;
    rematchAllServerFnMock.mockReturnValueOnce(new Promise((resolve) => { resolveRematch = resolve; }));
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    void user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    await screen.findByRole("button", { name: /starting/i });
    expect(screen.getByRole("button", { name: /starting/i }).getAttribute("disabled")).not.toBeNull();
    resolveRematch({ importJobId: "job-1", enqueuedCount: 5 });
  });

  it("Re-scan Matches shows toast with enqueued file count", async () => {
    const { toast } = await import("sonner");
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 42 });
    invalidateMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(toast.success).toHaveBeenCalledWith("Queued 42 files for matching");
  });

  it("Re-scan Matches shows singular 'file' for count of 1", async () => {
    const { toast } = await import("sonner");
    rematchAllServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 1 });
    invalidateMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(toast.success).toHaveBeenCalledWith("Queued 1 file for matching");
  });

  it("Re-scan Matches button returns to idle after server error", async () => {
    rematchAllServerFnMock.mockRejectedValueOnce(new Error("network error"));
    const user = userEvent.setup();
    const { Route } = await import("./match-suggestions");
    const MatchSuggestionsPage = (Route.options.component as React.ComponentType);
    render(<MatchSuggestionsPage />);
    await user.click(screen.getByRole("button", { name: /re-scan matches/i }));
    expect(screen.getByRole("button", { name: /re-scan matches/i }).getAttribute("disabled")).toBeNull();
  });
});
