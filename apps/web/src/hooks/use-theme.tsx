import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { setThemeServerFn, type ThemePreference } from "~/lib/server-fns/app-settings";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function setThemeCookie(theme: ThemePreference) {
  document.cookie = `theme=${theme};path=/;max-age=31536000;SameSite=Lax`;
}

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemePreference;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [systemDark, setSystemDark] = useState(() => getSystemDark());

  const resolved = resolveTheme(theme, systemDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { setSystemDark(mql.matches); };
    mql.addEventListener("change", handler);
    return () => { mql.removeEventListener("change", handler); };
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    setThemeCookie(next);
    setThemeServerFn({ data: { theme: next } }).catch(() => {
      toast.error("Failed to save theme preference");
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme: resolved, setTheme, toggleTheme }),
    [theme, resolved, setTheme, toggleTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
