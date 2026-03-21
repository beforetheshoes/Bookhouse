import { useState, useCallback, useSyncExternalStore } from "react";

export type TextOverflow = "wrap" | "truncate";

export interface LibraryTablePreferences {
  columnVisibility: Record<string, boolean>;
  textOverflow: TextOverflow;
}

const STORAGE_KEY = "library-table-prefs";

const DEFAULTS: LibraryTablePreferences = {
  columnVisibility: {},
  textOverflow: "truncate",
};

function isValidPrefs(value: unknown): value is LibraryTablePreferences {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.columnVisibility !== "object" || obj.columnVisibility === null)
    return false;
  if (obj.textOverflow !== "wrap" && obj.textOverflow !== "truncate")
    return false;
  return true;
}

const UNINITIALIZED = Symbol("uninitialized");
let cachedRaw: string | null | typeof UNINITIALIZED = UNINITIALIZED;
let cachedPrefs: LibraryTablePreferences = DEFAULTS;

function getSnapshot(): LibraryTablePreferences {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === cachedRaw) return cachedPrefs;
  cachedRaw = stored;
  if (!stored) {
    cachedPrefs = DEFAULTS;
    return DEFAULTS;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    cachedPrefs = isValidPrefs(parsed) ? parsed : DEFAULTS;
  } catch {
    cachedPrefs = DEFAULTS;
  }
  return cachedPrefs;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
  };
}

/** @internal — test-only cache reset */
export function resetSnapshotCache(): void {
  cachedRaw = UNINITIALIZED;
  cachedPrefs = DEFAULTS;
}

export function useLibraryTablePreferences(): [
  LibraryTablePreferences,
  (prefs: LibraryTablePreferences) => void,
] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);
  const [, setTick] = useState(0);

  const setPrefs = useCallback((p: LibraryTablePreferences) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    setTick((t) => t + 1);
  }, []);

  return [prefs, setPrefs];
}
