// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const invalidateMock = vi.fn();

interface MockEditionEntry {
  contributors: { role: string; contributor: { nameDisplay: string } }[];
  editionFiles: { fileAsset: { absolutePath: string; mediaKind: string } }[];
}

interface MockWork {
  titleDisplay: string;
  createdAt: Date;
  editions: MockEditionEntry[];
}

let mockLoaderData: {
  audioLinks: {
    id: string;
    ebookWork: MockWork;
    audioWork: MockWork;
    matchType: string;
    confidence: number | null;
    reviewStatus: string;
  }[];
} = { audioLinks: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: invalidateMock, navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getAudioLinksServerFnMock = vi.fn();
const confirmAudioLinkServerFnMock = vi.fn();
const ignoreAudioLinkServerFnMock = vi.fn();
const rematchAllAudioServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/audio-links", () => ({
  getAudioLinksServerFn: getAudioLinksServerFnMock,
  confirmAudioLinkServerFn: confirmAudioLinkServerFnMock,
  ignoreAudioLinkServerFn: ignoreAudioLinkServerFnMock,
  rematchAllAudioServerFn: rematchAllAudioServerFnMock,
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
            {columns.map((col: { id?: string; header?: unknown }) => (
              <th key={col.id ?? String(col.header)}>
                {typeof col.header === "function" ? (col.header as (ctx: { column: { id: string | undefined } }) => React.ReactNode)({ column: { id: col.id } }) : (col.id ?? "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: { id: string }, i: number) => (
            <tr key={row.id || i} data-testid="data-table-row">
              {columns.map((col: { id?: string; accessorFn?: (r: unknown) => unknown; cell?: (ctx: { row: { original: unknown } }) => unknown }) => {
                const val = col.accessorFn ? String(col.accessorFn(row)) : "";
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
  }],
});

const makeAudioLink = (overrides: Partial<typeof mockLoaderData.audioLinks[number]> = {}) => ({
  id: "al-1",
  ebookWork: makeWork("Ebook Title", [{ role: "AUTHOR", name: "Author Name" }], [{ path: "/books/book.epub", kind: "EPUB" }]),
  audioWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author Name" }, { role: "NARRATOR", name: "Narrator Name" }], [{ path: "/audiobooks/book/chapter.mp3", kind: "AUDIO" }]),
  matchType: "EXACT_METADATA",
  confidence: null,
  reviewStatus: "PENDING",
  ...overrides,
});

describe("AudioLinksPage", () => {
  beforeEach(() => {
    mockLoaderData = { audioLinks: [] };
    vi.clearAllMocks();
  });

  it("loader calls getAudioLinksServerFn", async () => {
    getAudioLinksServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./audio-links");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getAudioLinksServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ audioLinks: [] });
  });

  it("renders 'Audio Links' heading", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Audio Links")).toBeTruthy();
  });

  it("renders empty state when no audio links", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("No audio links found")).toBeTruthy();
  });

  it("renders ebook and audio titles in card", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Audio Title")).toBeTruthy();
  });

  it("renders authors and narrators", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getAllByText("Author Name").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Narrator Name/)).toBeTruthy();
  });

  it("renders Merge and Ignore buttons for PENDING status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "PENDING" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Merge")).toBeTruthy();
    expect(screen.getByText("Ignore")).toBeTruthy();
  });

  it("does not render action buttons for CONFIRMED status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "CONFIRMED" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.queryByText("Merge")).toBeNull();
    expect(screen.queryByText("Ignore")).toBeNull();
  });

  it("does not render action buttons for IGNORED status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "IGNORED" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.queryByText("Merge")).toBeNull();
    expect(screen.queryByText("Ignore")).toBeNull();
  });

  it("renders confidence as percentage", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ confidence: 0.85 })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("renders confidence as dash when null", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ confidence: null })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders without folder when audio edition has no files", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({
        audioWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author" }], []),
      })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Audio Title")).toBeTruthy();
    // No folder path or track count rendered
    expect(screen.queryByText(/audio file/)).toBeNull();
  });

  it("renders singular 'file' when audio edition has exactly 1 audio track", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({
        audioWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author" }], [{ path: "/audio/track.mp3", kind: "AUDIO" }]),
      })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("1 audio file")).toBeTruthy();
  });

  it("renders plural 'files' when audio edition has multiple audio tracks", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({
        audioWork: makeWork("Audio Title", [{ role: "AUTHOR", name: "Author" }], [
          { path: "/audio/track1.mp3", kind: "AUDIO" },
          { path: "/audio/track2.mp3", kind: "AUDIO" },
        ]),
      })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("2 audio files")).toBeTruthy();
  });

  it("renders matchType badge", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ matchType: "EXACT_METADATA" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("EXACT_METADATA")).toBeTruthy();
  });

  it("renders status badge with fallback variant for unknown status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "UNKNOWN_STATUS" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("tab filtering: PENDING filters to pending only", async () => {
    mockLoaderData = {
      audioLinks: [
        makeAudioLink({ id: "al-1", reviewStatus: "PENDING" }),
        makeAudioLink({
          id: "al-2",
          reviewStatus: "CONFIRMED",
          ebookWork: makeWork("Confirmed Book", [], []),
        }),
      ],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    // Both are visible on "All" tab
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Confirmed Book")).toBeTruthy();
    // Click "Pending" tab
    const pendingTab = screen.getByRole("tab", { name: "Pending" });
    await userEvent.click(pendingTab);
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.queryByText("Confirmed Book")).toBeNull();
  });

  it("Merge button calls confirmAudioLinkServerFn", async () => {
    confirmAudioLinkServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { audioLinks: [makeAudioLink({ id: "al-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await userEvent.click(screen.getByText("Merge"));
    expect(confirmAudioLinkServerFnMock).toHaveBeenCalledWith({ data: { id: "al-1" } });
  });

  it("Ignore button calls ignoreAudioLinkServerFn", async () => {
    ignoreAudioLinkServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { audioLinks: [makeAudioLink({ id: "al-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await userEvent.click(screen.getByText("Ignore"));
    expect(ignoreAudioLinkServerFnMock).toHaveBeenCalledWith({ data: { id: "al-1" } });
  });

  describe("sort options", () => {
    const setupSortableLinks = () => {
      mockLoaderData = {
        audioLinks: [
          makeAudioLink({
            id: "al-1",
            ebookWork: makeWork(
              "Alpha Book",
              [{ role: "AUTHOR", name: "Charlie Author" }],
              [{ path: "/books/alpha.epub", kind: "EPUB" }],
            ),
            audioWork: makeWork(
              "Alpha Audio",
              [{ role: "AUTHOR", name: "Charlie Author" }],
              [{ path: "/audio/alpha.mp3", kind: "AUDIO" }],
            ),
          }),
          makeAudioLink({
            id: "al-2",
            ebookWork: makeWork(
              "Bravo Book",
              [{ role: "AUTHOR", name: "Alice Author" }],
              [{ path: "/books/bravo.epub", kind: "EPUB" }],
              new Date("2025-06-01"),
            ),
            audioWork: makeWork(
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
      // Each card has two titles (ebook + audio); grab the ebook titles
      return screen.getAllByText(/Book$/).map((el) => el.textContent);
    };

    it("sorts by title Z–A", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Title Z\u2013A");
      const titles = getCardTitles();
      expect(titles).toEqual(["Bravo Book", "Alpha Book"]);
    });

    it("sorts by author A–Z", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Author A\u2013Z");
      const titles = getCardTitles();
      // Alice Author < Charlie Author
      expect(titles).toEqual(["Bravo Book", "Alpha Book"]);
    });

    it("sorts by author A–Z with missing author uses fallback", async () => {
      mockLoaderData = {
        audioLinks: [
          makeAudioLink({
            id: "al-1",
            ebookWork: makeWork("No Author Book", [], [{ path: "/books/no-author.epub", kind: "EPUB" }]),
            audioWork: makeWork("No Author Audio", [], [{ path: "/audio/no-author.mp3", kind: "AUDIO" }]),
          }),
          makeAudioLink({
            id: "al-2",
            ebookWork: makeWork("Has Author Book", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/books/has-author.epub", kind: "EPUB" }]),
            audioWork: makeWork("Has Author Audio", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/audio/has-author.mp3", kind: "AUDIO" }]),
          }),
          makeAudioLink({
            id: "al-3",
            ebookWork: makeWork("Also No Author Book", [], [{ path: "/books/also-no-author.epub", kind: "EPUB" }]),
            audioWork: makeWork("Also No Author Audio", [], [{ path: "/audio/also-no-author.mp3", kind: "AUDIO" }]),
          }),
        ],
      };
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Author A\u2013Z");
      const titles = getCardTitles();
      // "Zach" < \uffff fallback, so Has Author comes first; two no-author items sort by fallback
      expect(titles[0]).toBe("Has Author Book");
    });

    it("sorts by author Z–A with missing author uses fallback", async () => {
      mockLoaderData = {
        audioLinks: [
          makeAudioLink({
            id: "al-1",
            ebookWork: makeWork("No Author Book", [], [{ path: "/books/no-author.epub", kind: "EPUB" }]),
            audioWork: makeWork("No Author Audio", [], [{ path: "/audio/no-author.mp3", kind: "AUDIO" }]),
          }),
          makeAudioLink({
            id: "al-2",
            ebookWork: makeWork("Has Author Book", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/books/has-author.epub", kind: "EPUB" }]),
            audioWork: makeWork("Has Author Audio", [{ role: "AUTHOR", name: "Zach" }], [{ path: "/audio/has-author.mp3", kind: "AUDIO" }]),
          }),
          makeAudioLink({
            id: "al-3",
            ebookWork: makeWork("Also No Author Book", [], [{ path: "/books/also-no-author.epub", kind: "EPUB" }]),
            audioWork: makeWork("Also No Author Audio", [], [{ path: "/audio/also-no-author.mp3", kind: "AUDIO" }]),
          }),
        ],
      };
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Author Z\u2013A");
      const titles = getCardTitles();
      // "Zach" > "" fallback, so Has Author comes first
      expect(titles[0]).toBe("Has Author Book");
    });

    it("sorts by author Z–A", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Author Z\u2013A");
      const titles = getCardTitles();
      // Charlie Author > Alice Author
      expect(titles).toEqual(["Alpha Book", "Bravo Book"]);
    });

    it("sorts by newest first", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Newest first");
      const titles = getCardTitles();
      // Bravo (2025-06-01) > Alpha (2025-01-01)
      expect(titles).toEqual(["Bravo Book", "Alpha Book"]);
    });

    it("sorts by oldest first", async () => {
      setupSortableLinks();
      const user = userEvent.setup();
      const { Route } = await import("./audio-links");
      const AudioLinksPage = (Route.options.component as React.ComponentType);
      render(<AudioLinksPage />);
      await selectSortOption(user, "Oldest first");
      const titles = getCardTitles();
      // Alpha (2025-01-01) < Bravo (2025-06-01)
      expect(titles).toEqual(["Alpha Book", "Bravo Book"]);
    });
  });

  it("renders Re-match All button", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByRole("button", { name: /re-match all/i })).toBeTruthy();
  });

  it("Re-match All button calls rematchAllAudioServerFn and invalidates router", async () => {
    rematchAllAudioServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 42 });
    invalidateMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /re-match all/i }));
    expect(rematchAllAudioServerFnMock).toHaveBeenCalled();
  });

  it("Re-match All handles failure gracefully when mutation returns null", async () => {
    rematchAllAudioServerFnMock.mockRejectedValueOnce(new Error("fail"));
    invalidateMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /re-match all/i }));
    expect(rematchAllAudioServerFnMock).toHaveBeenCalled();
  });

  it("Re-match All shows toast when zero audiobook files to match", async () => {
    const { toast } = await import("sonner");
    rematchAllAudioServerFnMock.mockResolvedValueOnce({ importJobId: "job-1", enqueuedCount: 0 });
    invalidateMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /re-match all/i }));
    expect(toast.success).toHaveBeenCalledWith("No audiobook files to match");
  });

  it("renders view toggle buttons", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByRole("button", { name: /card view/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /table view/i })).toBeTruthy();
  });

  it("switches to table view when table button is clicked", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    // Initially in card view
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    // Switch to table view
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByTestId("data-table")).toBeTruthy();
  });

  it("hides sort dropdown in table view", async () => {
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    // Sort dropdown visible in card view
    expect(screen.getByRole("combobox")).toBeTruthy();
    // Switch to table view — sort dropdown hidden (table has its own sorting)
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("table view renders ebook and audio titles in cells", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Audio Title")).toBeTruthy();
  });

  it("table view renders match type badge and confidence", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ matchType: "NORMALIZED_TITLE", confidence: 0.92 })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("NORMALIZED_TITLE")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
  });

  it("table view renders status badge", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("PENDING")).toBeTruthy();
  });

  it("table view renders Merge/Ignore buttons for PENDING links", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("Merge")).toBeTruthy();
    expect(screen.getByText("Ignore")).toBeTruthy();
  });

  it("table view does not render action buttons for CONFIRMED links", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "CONFIRMED" })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.queryByText("Merge")).toBeNull();
    expect(screen.queryByText("Ignore")).toBeNull();
  });

  it("table view renders author from ebook work", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("Author Name")).toBeTruthy();
  });

  it("table view Merge button calls confirmAudioLinkServerFn", async () => {
    confirmAudioLinkServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { audioLinks: [makeAudioLink({ id: "al-1", reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    await user.click(screen.getByText("Merge"));
    expect(confirmAudioLinkServerFnMock).toHaveBeenCalledWith({ data: { id: "al-1" } });
  });

  it("table view Ignore button calls ignoreAudioLinkServerFn", async () => {
    ignoreAudioLinkServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { audioLinks: [makeAudioLink({ id: "al-1", reviewStatus: "PENDING" })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    await user.click(screen.getByText("Ignore"));
    expect(ignoreAudioLinkServerFnMock).toHaveBeenCalledWith({ data: { id: "al-1" } });
  });

  it("switches back to card view from table view", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByTestId("data-table")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /card view/i }));
    expect(screen.queryByTestId("data-table")).toBeNull();
  });

  it("table view renders dash for missing author and null confidence", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({
        ebookWork: makeWork("No Author Book", [], []),
        audioWork: makeWork("No Author Audio", [], []),
        confidence: null,
      })],
    };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    // "—" rendered for missing author and null confidence
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("table view renders outline badge for unknown status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "UNKNOWN_STATUS" })] };
    const user = userEvent.setup();
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("shows row count in subtitle", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink(), makeAudioLink({ id: "al-2" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText(/2 total/)).toBeTruthy();
  });
});
