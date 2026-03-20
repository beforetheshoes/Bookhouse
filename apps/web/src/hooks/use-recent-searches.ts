import { useCallback, useState } from "react";

const STORAGE_KEY = "recent-searches";
const MAX_SEARCHES = 10;

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function writeToStorage(searches: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
}

export function useRecentSearches() {
  const [searches, setSearches] = useState<string[]>(readFromStorage);

  const addSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearches((prev) => {
      const filtered = prev.filter((s) => s !== trimmed);
      const next = [trimmed, ...filtered].slice(0, MAX_SEARCHES);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clearSearches = useCallback(() => {
    setSearches([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { searches, addSearch, clearSearches };
}
