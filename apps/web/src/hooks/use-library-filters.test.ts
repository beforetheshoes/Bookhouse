// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLibraryFilters } from "./use-library-filters";

type SearchParams = Record<string, string | number | boolean | string[] | undefined>;
type NavigateOpts = { search: (prev: SearchParams) => SearchParams };

function extractSearch(mockFn: ReturnType<typeof vi.fn>): (prev: SearchParams) => SearchParams {
  const call = mockFn.mock.calls[0] as [NavigateOpts] | undefined;
  if (!call) throw new Error("Expected navigate to have been called");
  return call[0].search;
}

describe("useLibraryFilters", () => {
  const mockNavigate = vi.fn().mockImplementation((opts: { search?: (prev: SearchParams) => object }) => {
    if (typeof opts.search === "function") {
      opts.search({});
    }
  });

  const defaultSearch = { page: 1, pageSize: 50, sort: "title-asc" as const, view: "works" as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateSearch calls navigate with merged params and page reset to 1", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.updateSearch({ q: "test" });
    });
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
      to: ".",
      replace: true,
    }));
  });

  it("updateSearch preserves explicit page", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.updateSearch({ page: 3 });
    });
    expect(mockNavigate).toHaveBeenCalled();
    // The search function inside navigate should set page to 3
    const merged = extractSearch(mockNavigate)({});
    expect(merged.page).toBe(3);
  });

  it("handleFiltersChange maps filter values to search params", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.handleFiltersChange({
        format: ["EBOOK"],
        authorId: undefined,
        seriesId: undefined,
        hasCover: true,
        enriched: undefined,
        hasDescription: undefined,
        inSeries: undefined,
      });
    });
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("handleSearchChange passes q, sets undefined when empty", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.handleSearchChange("foo");
    });
    expect(mockNavigate).toHaveBeenCalled();

    mockNavigate.mockClear();
    act(() => {
      result.current.handleSearchChange("");
    });
    expect(mockNavigate).toHaveBeenCalled();
    const merged = extractSearch(mockNavigate)({});
    expect(merged.q).toBeUndefined();
  });

  it("handleSortChange passes sort as typed param", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.handleSortChange("title-desc");
    });
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("handleColumnSort converts updater to sort param", () => {
    const search = { ...defaultSearch, sort: "title-asc" as const };
    const { result } = renderHook(() =>
      useLibraryFilters({ search, navigate: mockNavigate }),
    );
    act(() => {
      // Simulate TanStack Table passing a function updater that toggles title sort
      result.current.handleColumnSort(() => [{ id: "titleDisplay", desc: true }]);
    });
    expect(mockNavigate).toHaveBeenCalled();
    const merged = extractSearch(mockNavigate)({});
    expect(merged.sort).toBe("title-desc");
  });

  it("handlePageChange navigates with explicit page", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.handlePageChange(5);
    });
    expect(mockNavigate).toHaveBeenCalled();
    const merged = extractSearch(mockNavigate)({});
    expect(merged.page).toBe(5);
  });

  it("handlePageSizeChange navigates with pageSize and resets to page 1", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: defaultSearch, navigate: mockNavigate }),
    );
    act(() => {
      result.current.handlePageSizeChange(20);
    });
    expect(mockNavigate).toHaveBeenCalled();
    const merged = extractSearch(mockNavigate)({});
    expect(merged.pageSize).toBe(20);
    expect(merged.page).toBe(1);
  });

  it("tableSorting derives correct state from search.sort", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: { ...defaultSearch, sort: "author-desc" as const }, navigate: mockNavigate }),
    );
    expect(result.current.tableSorting).toEqual([{ id: "authors", desc: true }]);
  });

  it("tableSorting returns empty array for unknown sort", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: { ...defaultSearch, sort: "recent" as const }, navigate: mockNavigate }),
    );
    expect(result.current.tableSorting).toEqual([]);
  });

  it("currentFilters extracts filter fields from search", () => {
    const search = {
      ...defaultSearch,
      format: ["EBOOK" as const],
      hasCover: true,
      authorId: ["a1"],
      seriesId: undefined,
      enriched: undefined,
      hasDescription: undefined,
      inSeries: undefined,
    };
    const { result } = renderHook(() =>
      useLibraryFilters({ search, navigate: mockNavigate }),
    );
    expect(result.current.currentFilters.format).toEqual(["EBOOK"]);
    expect(result.current.currentFilters.hasCover).toBe(true);
    expect(result.current.currentFilters.authorId).toEqual(["a1"]);
  });

  it("handleViewModeChange navigates with view, resets sort and page", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({ search: { ...defaultSearch, sort: "author-desc" as const, page: 3 }, navigate: mockNavigate }),
    );
    act(() => {
      result.current.handleViewModeChange("editions");
    });
    expect(mockNavigate).toHaveBeenCalled();
    const merged = extractSearch(mockNavigate)({});
    expect(merged.view).toBe("editions");
    expect(merged.sort).toBe("title-asc");
    expect(merged.page).toBe(1);
  });

  it("tableSorting uses custom sortToColumn map when provided", () => {
    const customSortToColumn = {
      "publisher-asc": { id: "publisher", desc: false },
    };
    const { result } = renderHook(() =>
      useLibraryFilters({
        search: { ...defaultSearch, sort: "publisher-asc" as const },
        navigate: mockNavigate,
        sortToColumn: customSortToColumn,
      }),
    );
    expect(result.current.tableSorting).toEqual([{ id: "publisher", desc: false }]);
  });

  it("handleColumnSort uses custom sortMap when provided", () => {
    const customSortMap = {
      publisher: { asc: "publisher-asc" as const, desc: "publisher-desc" as const },
    };
    const customSortToColumn = {
      "publisher-asc": { id: "publisher", desc: false },
    };
    const { result } = renderHook(() =>
      useLibraryFilters({
        search: { ...defaultSearch, sort: "publisher-asc" as const },
        navigate: mockNavigate,
        sortMap: customSortMap,
        sortToColumn: customSortToColumn,
      }),
    );
    act(() => {
      result.current.handleColumnSort(() => [{ id: "publisher", desc: true }]);
    });
    expect(mockNavigate).toHaveBeenCalled();
    const merged = extractSearch(mockNavigate)({});
    expect(merged.sort).toBe("publisher-desc");
  });
});
