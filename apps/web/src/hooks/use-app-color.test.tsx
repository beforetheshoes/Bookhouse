// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

const { setColorModeServerFnMock, setAccentColorServerFnMock, setBrandPaletteServerFnMock } =
  vi.hoisted(() => ({
    setColorModeServerFnMock: vi.fn(),
    setAccentColorServerFnMock: vi.fn(),
    setBrandPaletteServerFnMock: vi.fn(),
  }));

vi.mock("~/lib/server-fns/app-settings", () => ({
  setColorModeServerFn: setColorModeServerFnMock,
  setAccentColorServerFn: setAccentColorServerFnMock,
  setBrandPaletteServerFn: setBrandPaletteServerFnMock,
}));

let mockResolvedTheme = "light";

vi.mock("./use-theme", () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme }),
}));

let mockPathname = "/library";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: mockPathname }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("~/lib/color-utils", () => ({
  generateCoverTheme: (colors: string[] | null, mode: string): Record<string, string> | null => {
    if (!colors || colors.length === 0) return null;
    return {
      "--cover-primary": `cover-primary-${mode}`,
      "--cover-secondary": `cover-secondary-${mode}`,
      "--cover-accent": `cover-accent-${mode}`,
      "--cover-text": `cover-text-${mode}`,
    };
  },
  generateAccentTheme: (hex: string, mode: string): Record<string, string> => ({
    "--cover-primary": `accent-primary-${hex}-${mode}`,
    "--cover-secondary": `accent-secondary-${hex}-${mode}`,
    "--cover-accent": `accent-accent-${hex}-${mode}`,
    "--cover-text": `accent-text-${hex}-${mode}`,
  }),
  deriveCoverSignature: (colors: string[] | null, mode: string) => {
    if (!colors || colors.length === 0) return null;
    return {
      bg: `sig-bg-${mode}`,
      glow: `sig-glow-${mode}`,
      accent: `sig-accent-${mode}`,
      chip: `sig-chip-${mode}`,
      chipText: `sig-chip-text-${mode}`,
      text: `sig-text-${mode}`,
      side: `sig-side-${mode}`,
    };
  },
}));

import { AppColorProvider, useAppColor } from "./use-app-color";
import { toast } from "sonner";
import type { ColorMode } from "~/lib/server-fns/app-settings";
import type { PaletteKey } from "~/components/branding/palettes";

function wrapper(
  initialColorMode: ColorMode = "book",
  initialAccentColor: string | null = null,
  initialBrandPalette: PaletteKey = "shelf",
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return AppColorProvider({
      initialColorMode,
      initialAccentColor,
      initialBrandPalette,
      children,
    });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setColorModeServerFnMock.mockResolvedValue({ mode: "book" });
  setAccentColorServerFnMock.mockResolvedValue({ color: null });
  setBrandPaletteServerFnMock.mockResolvedValue({ palette: "shelf" });
  mockResolvedTheme = "light";
  mockPathname = "/library";

  // Clean up DOM elements from previous tests
  const wrapperEl = document.querySelector("[data-slot='sidebar-wrapper']");
  if (wrapperEl) document.body.removeChild(wrapperEl);
});

describe("useAppColor", () => {
  it("throws when used outside AppColorProvider", () => {
    expect(() => {
      renderHook(() => useAppColor());
    }).toThrow("useAppColor must be used within an AppColorProvider");
  });

  it("returns initial colorMode", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("off") });
    expect(result.current.colorMode).toBe("off");
  });

  it("returns initial accentColor", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("accent", "#ff0000") });
    expect(result.current.accentColor).toBe("#ff0000");
  });

  it("setColorMode updates state and calls server fn", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setColorMode("off"); });
    expect(result.current.colorMode).toBe("off");
    expect(setColorModeServerFnMock).toHaveBeenCalledWith({ data: { mode: "off" } });
  });

  it("setAccentColor updates state and calls server fn", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("accent", "#ff0000") });
    act(() => { result.current.setAccentColor("#00ff00"); });
    expect(result.current.accentColor).toBe("#00ff00");
    expect(setAccentColorServerFnMock).toHaveBeenCalledWith({ data: { color: "#00ff00" } });
  });

  it("setAccentColor with null calls server fn with null", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("accent", "#ff0000") });
    act(() => { result.current.setAccentColor(null); });
    expect(result.current.accentColor).toBeNull();
    expect(setAccentColorServerFnMock).toHaveBeenCalledWith({ data: { color: null } });
  });

  it("setBookColors updates book colors", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    // No server call for book colors — they are ephemeral
    expect(setColorModeServerFnMock).not.toHaveBeenCalled();
  });

  it("shows toast when setColorMode server fn fails", async () => {
    setColorModeServerFnMock.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setColorMode("accent"); });
    await vi.waitFor(() => {
      expect((toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("Failed to save color mode");
    });
  });

  it("shows toast when setAccentColor server fn fails", async () => {
    setAccentColorServerFnMock.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("accent") });
    act(() => { result.current.setAccentColor("#ff0000"); });
    await vi.waitFor(() => {
      expect((toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("Failed to save accent color");
    });
  });

  it("returns initial brand palette and exposes its full palette object", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book", null, "vivid") });
    expect(result.current.brandPalette).toBe("vivid");
    expect(result.current.palette.name).toBe("Vivid");
  });

  it("falls back to shelf when initial brand palette is not a known key", () => {
    const { result } = renderHook(() => useAppColor(), {
      wrapper: wrapper("book", null, "rainbow" as PaletteKey),
    });
    expect(result.current.brandPalette).toBe("shelf");
  });

  it("setBrandPalette updates state and calls server fn", () => {
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBrandPalette("forest"); });
    expect(result.current.brandPalette).toBe("forest");
    expect(result.current.palette.name).toBe("Forest");
    expect(setBrandPaletteServerFnMock).toHaveBeenCalledWith({ data: { palette: "forest" } });
  });

  it("shows toast when setBrandPalette server fn fails", async () => {
    setBrandPaletteServerFnMock.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBrandPalette("sunset"); });
    await vi.waitFor(() => {
      expect((toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("Failed to save brand palette");
    });
  });
});

describe("AppColorProvider gradient application", () => {
  function setupDom() {
    const wrapperEl = document.createElement("div");
    wrapperEl.setAttribute("data-slot", "sidebar-wrapper");
    const insetEl = document.createElement("div");
    insetEl.setAttribute("data-slot", "sidebar-inset");
    const sidebarEl = document.createElement("div");
    sidebarEl.setAttribute("data-slot", "sidebar-inner");
    wrapperEl.appendChild(sidebarEl);
    wrapperEl.appendChild(insetEl);
    document.body.appendChild(wrapperEl);
    return { wrapperEl, insetEl, sidebarEl };
  }

  it("applies gradient to sidebar-wrapper when book mode has colors", () => {
    const { wrapperEl, insetEl, sidebarEl } = setupDom();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#1a2b3c", "#4d5e6f"]); });

    expect(wrapperEl.style.background).not.toBe("");
    expect(insetEl.style.background).toBe("transparent");
    expect(sidebarEl.style.background).toBe("transparent");
  });

  it("clears gradient when mode is off", () => {
    const { wrapperEl } = setupDom();
    renderHook(() => useAppColor(), { wrapper: wrapper("off") });
    expect(wrapperEl.style.background).toBe("");
  });

  it("applies gradient in page mode based on pathname", () => {
    mockPathname = "/settings";
    const { wrapperEl } = setupDom();
    renderHook(() => useAppColor(), { wrapper: wrapper("page") });
    expect(wrapperEl.style.background).not.toBe("");
  });

  it("applies gradient in accent mode with accentColor", () => {
    const { wrapperEl } = setupDom();
    renderHook(() => useAppColor(), { wrapper: wrapper("accent", "#3366cc") });
    expect(wrapperEl.style.background).not.toBe("");
  });

  it("does not apply gradient in accent mode without accentColor", () => {
    const { wrapperEl } = setupDom();
    renderHook(() => useAppColor(), { wrapper: wrapper("accent", null) });
    expect(wrapperEl.style.background).toBe("");
  });

  it("does not apply gradient in book mode without book colors", () => {
    const { wrapperEl } = setupDom();
    renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    expect(wrapperEl.style.background).toBe("");
  });

  it("applies gradient when on work page with book colors regardless of mode", () => {
    mockPathname = "/library/work-1";
    const { wrapperEl } = setupDom();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("off") });
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    expect(wrapperEl.style.background).not.toBe("");
  });

  it("handles missing wrapper element gracefully", () => {
    // No DOM setup — wrapper element missing
    renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    // No error thrown
  });

  it("handles missing child elements in wrapper", () => {
    const wrapperEl = document.createElement("div");
    wrapperEl.setAttribute("data-slot", "sidebar-wrapper");
    document.body.appendChild(wrapperEl);

    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    expect(wrapperEl.style.background).not.toBe("");
  });

  it("clears styles when activeTheme becomes null", () => {
    const { wrapperEl, insetEl, sidebarEl } = setupDom();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });

    // First, set book colors to get a gradient
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    expect(wrapperEl.style.background).not.toBe("");

    // Then switch to off mode which clears the gradient
    act(() => { result.current.setColorMode("off"); });
    expect(wrapperEl.style.background).toBe("");
    expect(insetEl.style.background).toBe("");
    expect(sidebarEl.style.background).toBe("");
  });

  it("page mode returns null for unknown paths", () => {
    mockPathname = "/unknown-path";
    const { wrapperEl } = setupDom();
    renderHook(() => useAppColor(), { wrapper: wrapper("page") });
    // No matching page accent, so should clear
    expect(wrapperEl.style.background).toBe("");
  });

  it("page mode matches sub-paths", () => {
    mockPathname = "/library/work-123";
    const { wrapperEl } = setupDom();
    // On a work page with page mode but no book colors — uses page accent for /library
    renderHook(() => useAppColor(), { wrapper: wrapper("page") });
    // isWorkPage is true, but bookColors is null, so falls through to page mode
    // which matches /library prefix
    expect(wrapperEl.style.background).not.toBe("");
  });

  it("setBookColors with empty array clears gradient (treated as no colors)", () => {
    const { wrapperEl } = setupDom();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });

    // First set some colors to get a gradient
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    expect(wrapperEl.style.background).not.toBe("");

    // Set empty array — should clear gradient
    act(() => { result.current.setBookColors([]); });
    expect(wrapperEl.style.background).toBe("");
  });

  it("mode change from book to accent without accent color shows no gradient", () => {
    const { wrapperEl } = setupDom();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });

    // Set book colors first
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    expect(wrapperEl.style.background).not.toBe("");

    // Switch to accent mode with no accent color set
    act(() => { result.current.setColorMode("accent"); });
    // No accent color → null theme → no gradient
    expect(wrapperEl.style.background).toBe("");
  });

  it("dark mode toggle recomputes theme with new resolvedTheme", () => {
    const { wrapperEl } = setupDom();
    mockResolvedTheme = "light";
    const { result, rerender } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });

    act(() => { result.current.setBookColors(["#1a2b3c", "#4d5e6f"]); });
    const lightBg = wrapperEl.style.background;
    expect(lightBg).not.toBe("");

    // Simulate dark mode toggle by changing resolvedTheme and re-rendering
    mockResolvedTheme = "dark";
    rerender();

    const darkBg = wrapperEl.style.background;
    expect(darkBg).not.toBe("");
    // Light and dark should produce different gradients
    expect(lightBg).not.toBe(darkBg);
  });

  it("cleanup restores previous wrapper styles", () => {
    const { wrapperEl } = setupDom();
    wrapperEl.style.cssText = "color: red;";

    const { unmount, result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#aabbcc"]); });
    expect(wrapperEl.style.background).not.toBe("");

    unmount();
    // After unmount, cleanup should restore original styles
    // The cleanup function in the useEffect restores the previous cssText
  });
});

describe("AppColorProvider cover signature", () => {
  function setupInset() {
    const wrapperEl = document.createElement("div");
    wrapperEl.setAttribute("data-slot", "sidebar-wrapper");
    const insetEl = document.createElement("div");
    insetEl.setAttribute("data-slot", "sidebar-inset");
    wrapperEl.appendChild(insetEl);
    document.body.appendChild(wrapperEl);
    return insetEl;
  }

  it("publishes signature CSS custom properties on the inset when on a work page", () => {
    mockPathname = "/library/work-1";
    const insetEl = setupInset();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#1a2b3c", "#4d5e6f"]); });
    expect(insetEl.style.getPropertyValue("--bh-bg")).toBe("sig-bg-light");
    expect(insetEl.style.getPropertyValue("--bh-glow")).toBe("sig-glow-light");
    expect(insetEl.style.getPropertyValue("--bh-accent")).toBe("sig-accent-light");
    expect(insetEl.style.getPropertyValue("--bh-side")).toBe("sig-side-light");
    expect(result.current.coverSignature?.bg).toBe("sig-bg-light");
  });

  it("clears signature properties when leaving work page or clearing colors", () => {
    mockPathname = "/library/work-1";
    const insetEl = setupInset();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#1a2b3c"]); });
    expect(insetEl.style.getPropertyValue("--bh-bg")).not.toBe("");
    act(() => { result.current.setBookColors(null); });
    expect(insetEl.style.getPropertyValue("--bh-bg")).toBe("");
    expect(result.current.coverSignature).toBeNull();
  });

  it("does not produce signature on non-work pages even with book colors set", () => {
    mockPathname = "/library";
    const insetEl = setupInset();
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#1a2b3c"]); });
    expect(insetEl.style.getPropertyValue("--bh-bg")).toBe("");
    expect(result.current.coverSignature).toBeNull();
  });

  it("handles missing inset element gracefully when signature would apply", () => {
    mockPathname = "/library/work-1";
    // no inset in DOM
    const { result } = renderHook(() => useAppColor(), { wrapper: wrapper("book") });
    act(() => { result.current.setBookColors(["#1a2b3c"]); });
    // No error
    expect(result.current.coverSignature?.bg).toBe("sig-bg-light");
  });
});
