// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecentSearches } from "./use-recent-searches";

const STORAGE_KEY = "recent-searches";

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe("useRecentSearches", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
  });

  it("returns empty array when no searches saved", () => {
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.searches).toEqual([]);
  });

  it("reads searches from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["hello", "world"]));
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.searches).toEqual(["hello", "world"]);
  });

  it("adds a search to the front", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.addSearch("test");
    });
    expect(result.current.searches).toEqual(["test"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual(["test"]);
  });

  it("moves existing search to the front", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a", "b", "c"]));
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.addSearch("b");
    });
    expect(result.current.searches).toEqual(["b", "a", "c"]);
  });

  it("caps at 10 entries", () => {
    const existing = Array.from({ length: 10 }, (_, i) => `search-${String(i)}`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.addSearch("new");
    });
    expect(result.current.searches).toHaveLength(10);
    expect(result.current.searches[0]).toBe("new");
    expect(result.current.searches[9]).toBe("search-8");
  });

  it("does not add empty searches", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.addSearch("");
    });
    expect(result.current.searches).toEqual([]);
  });

  it("does not add whitespace-only searches", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.addSearch("   ");
    });
    expect(result.current.searches).toEqual([]);
  });

  it("clears all searches", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a", "b"]));
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.clearSearches();
    });
    expect(result.current.searches).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("handles invalid JSON in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.searches).toEqual([]);
  });

  it("handles non-array JSON in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "array" }));
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.searches).toEqual([]);
  });

  it("filters out non-string values from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["valid", 42, null, "also-valid"]));
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.searches).toEqual(["valid", "also-valid"]);
  });
});
