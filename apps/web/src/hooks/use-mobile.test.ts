// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

function setupMatchMedia(matches: boolean, innerWidth: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: innerWidth });
  const listeners: (() => void)[] = [];
  const mql = {
    matches,
    addEventListener: vi.fn((_event: string, cb: () => void) => listeners.push(cb)),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: vi.fn(() => mql) });
  return { mql, listeners };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("returns false when innerWidth >= 768", () => {
  setupMatchMedia(false, 768);
  const { result } = renderHook(() => useIsMobile());
  expect(result.current).toBe(false);
});

it("returns true when innerWidth < 768", () => {
  setupMatchMedia(true, 767);
  const { result } = renderHook(() => useIsMobile());
  expect(result.current).toBe(true);
});

it("updates when media query change event fires", () => {
  const { listeners } = setupMatchMedia(false, 1024);
  const { result } = renderHook(() => useIsMobile());
  expect(result.current).toBe(false);

  // Simulate viewport shrinking below breakpoint
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
  act(() => {
    listeners[0]?.();
  });

  expect(result.current).toBe(true);
});

it("removes event listener on unmount", () => {
  const { mql } = setupMatchMedia(false, 1024);
  const { unmount } = renderHook(() => useIsMobile());
  unmount();
  expect(mql.removeEventListener).toHaveBeenCalled();
});
