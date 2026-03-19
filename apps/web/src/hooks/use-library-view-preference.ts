import { useState, useCallback, useSyncExternalStore } from "react";

export type LibraryView = "grid" | "table";

const STORAGE_KEY = "library-view";

function getSnapshot(): LibraryView {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "table" ? "table" : "grid";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
  };
}

export function useLibraryViewPreference(): [LibraryView, (v: LibraryView) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, () => "grid" as LibraryView);
  const [, setTick] = useState(0);

  const setView = useCallback((v: LibraryView) => {
    localStorage.setItem(STORAGE_KEY, v);
    setTick((t) => t + 1);
  }, []);

  return [view, setView];
}
