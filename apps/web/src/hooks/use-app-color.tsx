import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTheme } from "./use-theme";
import { generateCoverTheme, generateAccentTheme } from "~/lib/color-utils";
import {
  setColorModeServerFn,
  setAccentColorServerFn,
  type ColorMode,
} from "~/lib/server-fns/app-settings";

// Fixed page accent colors — tasteful defaults per route
const PAGE_ACCENTS: Record<string, string> = {
  "/library": "#c4956a",
  "/series": "#6a8caf",
  "/authors": "#8b6a9f",
  "/collections": "#6aaf8b",
  "/duplicates": "#af8b6a",
  "/match-suggestions": "#7a9a8a",
  "/settings": "#7a8a9a",
};

interface AppColorContextValue {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  accentColor: string | null;
  setAccentColor: (hex: string | null) => void;
  setBookColors: (colors: string[] | null) => void;
}

const AppColorContext = createContext<AppColorContextValue | null>(null);

function getPageAccent(pathname: string): string | null {
  // Match the first path segment after /
  for (const [prefix, color] of Object.entries(PAGE_ACCENTS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return color;
  }
  return null;
}

export function AppColorProvider({
  initialColorMode,
  initialAccentColor,
  children,
}: {
  initialColorMode: ColorMode;
  initialAccentColor: string | null;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const [colorMode, setColorModeState] = useState<ColorMode>(initialColorMode);
  const [accentColor, setAccentColorState] = useState<string | null>(initialAccentColor);
  const [bookColors, setBookColorsState] = useState<string[] | null>(null);

  // Check if we're on a work detail page (the work page itself applies book colors via setBookColors)
  const isWorkPage = location.pathname.startsWith("/library/");

  // Compute the active theme based on mode, route, and available colors
  const activeTheme = useMemo((): Record<string, string> | null => {
    // Priority 1: On a work detail page with cover colors — those are set by setBookColors
    // and handled via bookColors state. The work page calls setBookColors on mount.
    // When on the work page, bookColors will be set. Use them.
    if (isWorkPage && bookColors) {
      return generateCoverTheme(bookColors, resolvedTheme);
    }

    // Priority 2: mode-based
    switch (colorMode) {
      case "off":
        return null;

      case "book":
        // Use last-viewed book's colors (persists across navigation)
        if (bookColors) return generateCoverTheme(bookColors, resolvedTheme);
        return null;

      case "page": {
        const pageColor = getPageAccent(location.pathname);
        if (pageColor) return generateAccentTheme(pageColor, resolvedTheme);
        return null;
      }

      case "accent":
        if (accentColor) return generateAccentTheme(accentColor, resolvedTheme);
        return null;
    }
  }, [colorMode, bookColors, accentColor, resolvedTheme, location.pathname, isWorkPage]);

  // Apply gradient to sidebar-wrapper
  useEffect(() => {
    const wrapper = document.querySelector<HTMLElement>("[data-slot='sidebar-wrapper']");
    if (!wrapper) return;

    if (!activeTheme) {
      // Clear any previously applied styles
      wrapper.style.background = "";
      const inset = document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");
      const sidebarInner = document.querySelector<HTMLElement>("[data-slot='sidebar-inner']");
      if (inset) inset.style.background = "";
      if (sidebarInner) sidebarInner.style.background = "";
      return;
    }

    const primary = activeTheme["--cover-primary"] as string;
    const secondary = activeTheme["--cover-secondary"] as string;
    const prev = wrapper.style.cssText;

    wrapper.style.background = [
      `radial-gradient(ellipse 60% 45% at 50% 0%, ${primary} 0%, transparent 70%)`,
      `linear-gradient(to bottom, ${secondary} 0%, transparent 55%)`,
    ].join(", ");

    const inset = document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");
    const sidebarInner = document.querySelector<HTMLElement>("[data-slot='sidebar-inner']");
    if (inset) inset.style.background = "transparent";
    if (sidebarInner) sidebarInner.style.background = "transparent";

    return () => {
      wrapper.style.cssText = prev;
      if (inset) inset.style.background = "";
      if (sidebarInner) sidebarInner.style.background = "";
    };
  }, [activeTheme]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    setColorModeServerFn({ data: { mode } }).catch(() => {
      toast.error("Failed to save color mode");
    });
  }, []);

  const setAccentColor = useCallback((hex: string | null) => {
    setAccentColorState(hex);
    setAccentColorServerFn({ data: { color: hex } }).catch(() => {
      toast.error("Failed to save accent color");
    });
  }, []);

  const setBookColors = useCallback((colors: string[] | null) => {
    setBookColorsState(colors);
  }, []);

  const value = useMemo(
    () => ({ colorMode, setColorMode, accentColor, setAccentColor, setBookColors }),
    [colorMode, setColorMode, accentColor, setAccentColor, setBookColors],
  );

  return <AppColorContext value={value}>{children}</AppColorContext>;
}

export function useAppColor(): AppColorContextValue {
  const context = useContext(AppColorContext);
  if (!context) {
    throw new Error("useAppColor must be used within an AppColorProvider");
  }
  return context;
}
