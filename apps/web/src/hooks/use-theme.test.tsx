// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

const setThemeServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/app-settings", () => ({
  setThemeServerFn: (...args: unknown[]): unknown => setThemeServerFnMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { ThemeProvider, useTheme } from "./use-theme";
import { toast } from "sonner";

let mqlListeners: ((event: { matches: boolean }) => void)[];
let mqlMatches: boolean;

function setupMatchMedia(matches: boolean) {
  mqlMatches = matches;
  mqlListeners = [];
  const mql = {
    get matches() { return mqlMatches; },
    addEventListener: vi.fn((_event: string, cb: (event: { matches: boolean }) => void) => {
      mqlListeners.push(cb);
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  });
  return mql;
}

function wrapper(initialTheme: "light" | "dark" | "system" = "system") {
  return function Wrapper({ children }: { children: ReactNode }) {
    return ThemeProvider({ initialTheme, children });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setThemeServerFnMock.mockResolvedValue({ theme: "light" });
  document.documentElement.classList.remove("dark");
  document.cookie = "theme=; max-age=0";
  setupMatchMedia(false);
});

describe("useTheme", () => {
  it("throws when used outside ThemeProvider", () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow("useTheme must be used within a ThemeProvider");
  });

  it("returns light as resolvedTheme when initialTheme is light", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("light") });
    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("returns dark as resolvedTheme when initialTheme is dark", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("dark") });
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("resolves system preference to light when OS is light", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("resolves system preference to dark when OS is dark", () => {
    setupMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("applies dark class on document.documentElement when resolved is dark", () => {
    setupMatchMedia(false);
    renderHook(() => useTheme(), { wrapper: wrapper("dark") });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when resolved is light", () => {
    document.documentElement.classList.add("dark");
    setupMatchMedia(false);
    renderHook(() => useTheme(), { wrapper: wrapper("light") });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme updates theme and calls server function", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("light") });

    act(() => { result.current.setTheme("dark"); });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(setThemeServerFnMock).toHaveBeenCalledWith({ data: { theme: "dark" } });
  });

  it("setTheme sets theme cookie", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("light") });

    act(() => { result.current.setTheme("dark"); });

    expect(document.cookie).toContain("theme=dark");
  });

  it("toggleTheme switches from light to dark", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("light") });

    act(() => { result.current.toggleTheme(); });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("toggleTheme switches from dark to light", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("dark") });

    act(() => { result.current.toggleTheme(); });

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("toggleTheme resolves system dark to explicit light", () => {
    setupMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.resolvedTheme).toBe("dark");

    act(() => { result.current.toggleTheme(); });

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("responds to system preference changes when theme is system", () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.resolvedTheme).toBe("light");

    act(() => {
      mqlMatches = true;
      mqlListeners[0]?.({ matches: true });
    });

    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("removes matchMedia listener on unmount", () => {
    const mql = setupMatchMedia(false);
    const { unmount } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });

  it("shows error toast when server function fails", async () => {
    setThemeServerFnMock.mockRejectedValue(new Error("network error"));
    setupMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("light") });

    act(() => { result.current.setTheme("dark"); });

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to save theme preference");
    });
  });
});
