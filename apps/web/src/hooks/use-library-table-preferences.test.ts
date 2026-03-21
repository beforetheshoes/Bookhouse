// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useLibraryTablePreferences,
  resetSnapshotCache,
  type LibraryTablePreferences,
} from "./use-library-table-preferences";

const STORAGE_KEY = "library-table-prefs";

const DEFAULTS: LibraryTablePreferences = {
  columnVisibility: {},
  textOverflow: "truncate",
};

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe("useLibraryTablePreferences", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    resetSnapshotCache();
  });

  it("defaults when localStorage is empty", () => {
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("reads stored preferences from localStorage", () => {
    const prefs: LibraryTablePreferences = {
      columnVisibility: { authors: false, isbn: false },
      textOverflow: "wrap",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(prefs);
  });

  it("ignores invalid JSON and defaults", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("ignores JSON with wrong shape and defaults", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bad: true }));
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("ignores JSON null value and defaults", () => {
    localStorage.setItem(STORAGE_KEY, "null");
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("ignores invalid textOverflow value and defaults", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ columnVisibility: {}, textOverflow: "bogus" }),
    );
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("persists to localStorage when setPrefs is called", () => {
    const { result } = renderHook(() => useLibraryTablePreferences());
    const updated: LibraryTablePreferences = {
      columnVisibility: { publisher: false },
      textOverflow: "wrap",
    };
    act(() => {
      result.current[1](updated);
    });
    expect(result.current[0]).toEqual(updated);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(updated));
  });

  it("re-reads on storage events", () => {
    const { result } = renderHook(() => useLibraryTablePreferences());
    expect(result.current[0]).toEqual(DEFAULTS);

    const updated: LibraryTablePreferences = {
      columnVisibility: { formats: false },
      textOverflow: "wrap",
    };
    act(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current[0]).toEqual(updated);
  });

  it("cleans up storage listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLibraryTablePreferences());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("returns defaults during SSR via getServerSnapshot", () => {
    function TestComponent() {
      const [prefs] = useLibraryTablePreferences();
      return createElement("span", null, prefs.textOverflow);
    }
    const html = renderToString(createElement(TestComponent));
    expect(html).toContain("truncate");
  });
});
