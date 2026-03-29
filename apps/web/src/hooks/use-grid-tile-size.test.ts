// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGridTileSize } from "./use-grid-tile-size";

const STORAGE_KEY = "grid-tile-size";

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

describe("useGridTileSize", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
  });

  it("defaults to 'small' when localStorage is empty", () => {
    const { result } = renderHook(() => useGridTileSize());
    expect(result.current[0]).toBe("small");
  });

  it("reads 'large' from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "large");
    const { result } = renderHook(() => useGridTileSize());
    expect(result.current[0]).toBe("large");
  });

  it("reads 'small' from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "small");
    const { result } = renderHook(() => useGridTileSize());
    expect(result.current[0]).toBe("small");
  });

  it("ignores invalid localStorage values and defaults to 'small'", () => {
    localStorage.setItem(STORAGE_KEY, "bogus");
    const { result } = renderHook(() => useGridTileSize());
    expect(result.current[0]).toBe("small");
  });

  it("persists to localStorage when setTileSize is called", () => {
    const { result } = renderHook(() => useGridTileSize());
    act(() => {
      result.current[1]("large");
    });
    expect(result.current[0]).toBe("large");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("large");
  });

  it("updates state when toggling back to small", () => {
    localStorage.setItem(STORAGE_KEY, "large");
    const { result } = renderHook(() => useGridTileSize());
    act(() => {
      result.current[1]("small");
    });
    expect(result.current[0]).toBe("small");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("small");
  });

  it("re-reads on storage events", () => {
    const { result } = renderHook(() => useGridTileSize());
    expect(result.current[0]).toBe("small");

    act(() => {
      localStorage.setItem(STORAGE_KEY, "large");
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current[0]).toBe("large");
  });

  it("cleans up storage listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useGridTileSize());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("returns 'small' during SSR via getServerSnapshot", () => {
    function TestComponent() {
      const [tileSize] = useGridTileSize();
      return createElement("span", null, tileSize);
    }
    const html = renderToString(createElement(TestComponent));
    expect(html).toContain("small");
  });
});
