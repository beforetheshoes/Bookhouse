import { useState, useCallback, useSyncExternalStore } from "react";

export type GridTileSize = "small" | "large";

const STORAGE_KEY = "grid-tile-size";

function getSnapshot(): GridTileSize {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "large" ? "large" : "small";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
  };
}

export function useGridTileSize(): [GridTileSize, (v: GridTileSize) => void] {
  const tileSize = useSyncExternalStore(subscribe, getSnapshot, () => "small" as GridTileSize);
  const [, setTick] = useState(0);

  const setTileSize = useCallback((v: GridTileSize) => {
    localStorage.setItem(STORAGE_KEY, v);
    setTick((t) => t + 1);
  }, []);

  return [tileSize, setTileSize];
}
