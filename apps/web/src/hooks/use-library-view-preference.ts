import { useState, useCallback, useSyncExternalStore } from "react";
import { useIsMobile } from "~/hooks/use-mobile";

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
  const view = useSyncExternalStore(subscribe, getSnapshot, (): LibraryView => "grid");
  const [, setTick] = useState(0);

  const setView = useCallback((v: LibraryView) => {
    localStorage.setItem(STORAGE_KEY, v);
    setTick((t) => t + 1);
  }, []);

  return [view, setView];
}

/**
 * The view the library should actually render.
 *
 * The works table is 800px of columns (editions, 1700px) laid out with
 * `table-fixed` at `width: 100%`, so at phone widths the browser scales those
 * columns down rather than scrolling — every cell collapses to an ellipsis
 * with no way to recover the text. The grid shows a superset of the same
 * information and is already phone-shaped, so below `md` it wins outright.
 *
 * The override lives here rather than in the routes so both callers get it
 * from one place, and so route tests that already mock this module inherit the
 * behaviour without stubbing `matchMedia`.
 *
 * `setView` still writes through, so a preference set on a phone is waiting
 * when the same person opens the library on a desktop.
 */
export function useEffectiveLibraryView(): [LibraryView, (v: LibraryView) => void] {
  const [view, setView] = useLibraryViewPreference();
  const isMobile = useIsMobile();
  return [isMobile ? "grid" : view, setView];
}
