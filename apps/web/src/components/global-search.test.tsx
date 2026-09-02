// @vitest-environment happy-dom
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...props }: { children?: React.ReactNode; to: string; params?: Record<string, string>; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => {
    let href = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value);
      }
    }
    return <a href={href} {...props}>{children}</a>;
  },
}));

const { searchMock, addSearchMock } = vi.hoisted(() => ({ searchMock: vi.fn(), addSearchMock: vi.fn() }));
vi.mock("~/lib/server-fns/search", () => ({
  searchLibraryServerFn: searchMock,
}));

vi.mock("~/hooks/use-recent-searches", () => ({
  useRecentSearches: () => ({
    searches: ["old query"],
    addSearch: addSearchMock,
    clearSearches: vi.fn(),
  }),
}));

import { GlobalSearch } from "./global-search";

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    searchMock.mockReset();
    addSearchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a search trigger button", () => {
    render(<GlobalSearch />);
    expect(screen.getByLabelText("Search library")).toBeTruthy();
  });

  it("shows keyboard shortcut hint", () => {
    render(<GlobalSearch />);
    expect(screen.getByText(/⌘K/)).toBeTruthy();
  });

  it("opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    expect(screen.getByPlaceholderText("Search works, authors, series...")).toBeTruthy();
  });

  it("opens dialog on Cmd+K", () => {
    render(<GlobalSearch />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });
    expect(screen.getByPlaceholderText("Search works, authors, series...")).toBeTruthy();
  });

  it("opens dialog on Ctrl+K", () => {
    render(<GlobalSearch />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    expect(screen.getByPlaceholderText("Search works, authors, series...")).toBeTruthy();
  });

  it("does not open dialog on plain K key", () => {
    render(<GlobalSearch />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    });
    expect(screen.queryByPlaceholderText("Search works, authors, series...")).toBeNull();
  });

  it("shows recent searches when dialog opens with empty input", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    expect(screen.getByText("Recent Searches")).toBeTruthy();
    expect(screen.getByText("old query")).toBeTruthy();
  });

  it("shows grouped results after debounced search", async () => {
    searchMock.mockResolvedValue({
      works: [{ id: "w1", titleDisplay: "The Hobbit", coverPath: null, editions: [], series: null }],
      authors: [{ id: "a1", nameDisplay: "Tolkien" }],
      series: [{ id: "s1", name: "Middle-earth" }],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "hobbit");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(screen.getByText("The Hobbit")).toBeTruthy();
    expect(screen.getByText("Tolkien")).toBeTruthy();
    expect(screen.getByText("Middle-earth")).toBeTruthy();
    // Check group headings exist (there are also badges with same text, so use getAllByText)
    expect(screen.getAllByText("Works").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Authors").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Series").length).toBeGreaterThan(0);
  });

  it("shows no results message when search returns empty", async () => {
    searchMock.mockResolvedValue({ works: [], authors: [], series: [] });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "zzzzz");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(screen.getByText("No results found")).toBeTruthy();
  });

  it("links work results to work detail page", async () => {
    searchMock.mockResolvedValue({
      works: [{ id: "w1", titleDisplay: "The Hobbit", coverPath: null, editions: [], series: null }],
      authors: [],
      series: [],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "hobbit");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const link = screen.getByText("The Hobbit").closest("a");
    expect(link?.getAttribute("href")).toBe("/library/w1");
  });

  it("links author results to author page", async () => {
    searchMock.mockResolvedValue({
      works: [],
      authors: [{ id: "a1", nameDisplay: "Tolkien" }],
      series: [],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "tolkien");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const link = screen.getByText("Tolkien").closest("a");
    expect(link?.getAttribute("href")).toBe("/authors/a1");
  });

  it("links series results to series page", async () => {
    searchMock.mockResolvedValue({
      works: [],
      authors: [],
      series: [{ id: "s1", name: "Middle-earth" }],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "middle");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const link = screen.getByText("Middle-earth").closest("a");
    expect(link?.getAttribute("href")).toBe("/series/s1");
  });

  it("cleans up keyboard listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<GlobalSearch />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("clicking a recent search fills the input", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.click(screen.getByText("old query"));
    const input = screen.getByPlaceholderText("Search works, authors, series...");
    expect((input as HTMLInputElement).value).toBe("old query");
  });

  it("closes dialog and resets state when closed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    expect(screen.getByPlaceholderText("Search works, authors, series...")).toBeTruthy();

    // Close via escape
    await user.keyboard("{Escape}");

    // Dialog should be closed
    expect(screen.queryByPlaceholderText("Search works, authors, series...")).toBeNull();
  });

  it("ignores a slow answer for an earlier query that lands after a later one", async () => {
    // The mock's payload shape is looser than the real SearchResult, as elsewhere in this file.
    let resolveFirst: (value: never) => void = () => undefined;
    searchMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({
        works: [{ id: "w2", titleDisplay: "Harry Potter", coverPath: null, editions: [], series: null }],
        authors: [],
        series: [],
      });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    const input = screen.getByPlaceholderText("Search works, authors, series...");
    await user.type(input, "h");
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await user.type(input, "arry");
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(screen.getByText("Harry Potter")).toBeTruthy();

    // The stale "h" answer arrives last and must not replace the results.
    await act(async () => {
      resolveFirst({
        works: [{ id: "w1", titleDisplay: "Hamlet", coverPath: null, editions: [], series: null }],
        authors: [],
        series: [],
      } as never);
      await Promise.resolve();
    });
    expect(screen.queryByText("Hamlet")).toBeNull();
    expect(screen.getByText("Harry Potter")).toBeTruthy();
    // Recents are recorded when a result is opened, not per debounced prefix.
    expect(addSearchMock).not.toHaveBeenCalled();
  });

  it("remembers the query only when a result is opened", async () => {
    searchMock.mockResolvedValue({
      works: [{ id: "w1", titleDisplay: "Test Book", coverPath: null, editions: [], series: null }],
      authors: [],
      series: [],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), " test ");
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(addSearchMock).not.toHaveBeenCalled();

    await user.click(screen.getByText("Test Book"));
    expect(addSearchMock).toHaveBeenCalledWith("test");
  });

  it("does not record a blank query when a result is opened after the input was cleared", async () => {
    searchMock.mockResolvedValue({
      works: [{ id: "w1", titleDisplay: "Test Book", coverPath: null, editions: [], series: null }],
      authors: [],
      series: [],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    const input = screen.getByPlaceholderText("Search works, authors, series...");
    await user.type(input, "test");
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    // Cleared, but the debounce has not yet swept the results away.
    await user.clear(input);
    await user.click(screen.getByText("Test Book"));

    expect(addSearchMock).not.toHaveBeenCalled();
  });

  it("closes dialog when clicking a work result", async () => {
    searchMock.mockResolvedValue({
      works: [{ id: "w1", titleDisplay: "Test Book", coverPath: null, editions: [], series: null }],
      authors: [],
      series: [],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "test");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await user.click(screen.getByText("Test Book"));
    // Dialog should close
    expect(screen.queryByPlaceholderText("Search works, authors, series...")).toBeNull();
  });

  it("closes dialog when clicking an author result", async () => {
    searchMock.mockResolvedValue({
      works: [],
      authors: [{ id: "a1", nameDisplay: "Test Author" }],
      series: [],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "test");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await user.click(screen.getByText("Test Author"));
    expect(screen.queryByPlaceholderText("Search works, authors, series...")).toBeNull();
  });

  it("closes dialog when clicking a series result", async () => {
    searchMock.mockResolvedValue({
      works: [],
      authors: [],
      series: [{ id: "s1", name: "Test Series" }],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "test");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await user.click(screen.getByText("Test Series"));
    expect(screen.queryByPlaceholderText("Search works, authors, series...")).toBeNull();
  });

  it("does not call search for empty debounced value", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<GlobalSearch />);
    await user.click(screen.getByLabelText("Search library"));

    // Type and then clear
    await user.type(screen.getByPlaceholderText("Search works, authors, series..."), "a");
    await user.clear(screen.getByPlaceholderText("Search works, authors, series..."));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(searchMock).not.toHaveBeenCalled();
  });
});
