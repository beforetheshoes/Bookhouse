import { useState, useCallback, useSyncExternalStore } from "react";
import { useIsMobile } from "~/hooks/use-mobile";

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
  const tileSize = useSyncExternalStore(subscribe, getSnapshot, (): GridTileSize => "small");
  const [, setTick] = useState(0);

  const setTileSize = useCallback((v: GridTileSize) => {
    localStorage.setItem(STORAGE_KEY, v);
    setTick((t) => t + 1);
  }, []);

  return [tileSize, setTileSize];
}

/**
 * The tile size the grid should actually render.
 *
 * Large tiles are one column at 360px - a single cover per screen. A phone
 * gets the compact grid whatever is stored, and the toolbar hides the toggle
 * to match, so the controls no longer shift sideways when the view changes.
 *
 * `setTileSize` still writes through, so a desktop preference survives.
 */
export function useEffectiveGridTileSize(): [GridTileSize, (v: GridTileSize) => void] {
  const [tileSize, setTileSize] = useGridTileSize();
  const isMobile = useIsMobile();
  return [isMobile ? "small" : tileSize, setTileSize];
}
