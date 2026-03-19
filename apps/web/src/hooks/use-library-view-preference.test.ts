// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLibraryViewPreference } from "./use-library-view-preference";

const STORAGE_KEY = "library-view";

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

describe("useLibraryViewPreference", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
  });

  it("defaults to 'grid' when localStorage is empty", () => {
    const { result } = renderHook(() => useLibraryViewPreference());
    expect(result.current[0]).toBe("grid");
  });

  it("reads 'table' from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "table");
    const { result } = renderHook(() => useLibraryViewPreference());
    expect(result.current[0]).toBe("table");
  });

  it("reads 'grid' from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "grid");
    const { result } = renderHook(() => useLibraryViewPreference());
    expect(result.current[0]).toBe("grid");
  });

  it("ignores invalid localStorage values and defaults to 'grid'", () => {
    localStorage.setItem(STORAGE_KEY, "bogus");
    const { result } = renderHook(() => useLibraryViewPreference());
    expect(result.current[0]).toBe("grid");
  });

  it("persists to localStorage when setView is called", () => {
    const { result } = renderHook(() => useLibraryViewPreference());
    act(() => {
      result.current[1]("table");
    });
    expect(result.current[0]).toBe("table");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("table");
  });

  it("updates state when toggling back to grid", () => {
    localStorage.setItem(STORAGE_KEY, "table");
    const { result } = renderHook(() => useLibraryViewPreference());
    act(() => {
      result.current[1]("grid");
    });
    expect(result.current[0]).toBe("grid");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("grid");
  });

  it("re-reads on storage events", () => {
    const { result } = renderHook(() => useLibraryViewPreference());
    expect(result.current[0]).toBe("grid");

    act(() => {
      localStorage.setItem(STORAGE_KEY, "table");
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current[0]).toBe("table");
  });

  it("cleans up storage listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLibraryViewPreference());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("returns 'grid' during SSR via getServerSnapshot", () => {
    function TestComponent() {
      const [view] = useLibraryViewPreference();
      return createElement("span", null, view);
    }
    const html = renderToString(createElement(TestComponent));
    expect(html).toContain("grid");
  });
});
