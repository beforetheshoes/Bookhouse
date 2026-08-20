import { useState, useCallback, useSyncExternalStore } from "react";
import { useIsMobile } from "~/hooks/use-mobile";

export type LibraryView = "grid" | "table" | "list";

const STORAGE_KEY = "library-view";

function isLibraryView(value: string | null): value is LibraryView {
  return value === "grid" || value === "table" || value === "list";
}

/** The stored preference, or null when the reader has never chosen one. */
function getSnapshot(): LibraryView | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLibraryView(stored) ? stored : null;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
  };
}

function useStoredView(): [LibraryView | null, (v: LibraryView) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    (): LibraryView | null => null,
  );
  const [, setTick] = useState(0);

  const setView = useCallback((v: LibraryView) => {
    localStorage.setItem(STORAGE_KEY, v);
    setTick((t) => t + 1);
  }, []);

  return [stored, setView];
}

export function useLibraryViewPreference(): [LibraryView, (v: LibraryView) => void] {
  const [stored, setView] = useStoredView();
  return [stored ?? "grid", setView];
}

/**
 * The view the library should actually render.
 *
 * The works table is 800px of columns (editions, 1700px) laid out with
 * `table-fixed` at `width: 100%`, so at phone widths the browser scales those
 * columns down rather than scrolling — every cell collapses to an ellipsis
 * with no way to recover the text. It never renders below `md`.
 *
 * Phones default to the list: at two columns the grid fits roughly two books
 * per screen, and the list shows the same cover, title, author, formats and
 * progress at about a third of the height. The grid is still one tap away,
 * and a reader who picks it gets it — only `table` is overridden.
 *
 * The override lives here rather than in the routes so both callers get it
 * from one place, and so route tests that already mock this module inherit the
 * behaviour without stubbing `matchMedia`.
 *
 * `setView` still writes through, so a preference set on a phone is waiting
 * when the same person opens the library on a desktop.
 */
export function useEffectiveLibraryView(): [LibraryView, (v: LibraryView) => void] {
  const [stored, setView] = useStoredView();
  const isMobile = useIsMobile();
  if (isMobile) return [stored === "grid" ? "grid" : "list", setView];
  return [stored ?? "grid", setView];
}
