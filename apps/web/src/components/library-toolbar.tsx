import { useEffect, useState, useRef, type ReactNode } from "react";
import { Grid2x2, Grid3x3, LayoutGrid, Table2, X, CheckSquare } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useDebounce } from "~/hooks/use-debounce";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import type { LibraryView } from "~/hooks/use-library-view-preference";
import type { GridTileSize } from "~/hooks/use-grid-tile-size";
import type { LibrarySearchParams } from "~/lib/library-search-schema";

export type SortValue = LibrarySearchParams["sort"];

interface LibraryToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortValue: SortValue;
  onSortChange: (value: SortValue) => void;
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  filterValue: ReadingFilter;
  onFilterChange: (value: ReadingFilter) => void;
  showSort?: boolean;
  tileSize?: GridTileSize;
  onTileSizeChange?: (size: GridTileSize) => void;
  /** Grid select mode. Omit the handler to hide the toggle. */
  selectMode?: boolean;
  onSelectModeChange?: (on: boolean) => void;
  /**
   * Rendered first, inside the same row as the search box. The filters sheet
   * trigger goes here on phones: as a sibling above the toolbar it cost a
   * whole 52px band of its own.
   */
  leading?: ReactNode;
  /**
   * True when a filters sheet shows reading status and sort below `lg`, so
   * this row can drop them. Shelf detail has no such sheet and keeps them.
   */
  filtersInSheet?: boolean;
}

const FILTER_OPTIONS: { value: ReadingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Currently Reading" },
  { value: "finished", label: "Finished" },
  { value: "unread", label: "Unread" },
];

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "title-asc", label: "Title A-Z" },
  { value: "title-desc", label: "Title Z-A" },
  { value: "author-asc", label: "Author A-Z" },
  { value: "author-desc", label: "Author Z-A" },
  { value: "recent", label: "Recently Added" },
];

export function LibraryToolbar({
  searchValue,
  onSearchChange,
  sortValue,
  onSortChange,
  view,
  onViewChange,
  filterValue,
  onFilterChange,
  showSort = true,
  tileSize,
  onTileSizeChange,
  selectMode,
  onSelectModeChange,
  leading,
  filtersInSheet = false,
}: LibraryToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debouncedSearch = useDebounce(localSearch, 300);

  const isFirstSearchSync = useRef(true);
  useEffect(() => {
    // Skip the mount run: updateSearch resets page to 1, so firing here made
    // any link, reload or back-navigation to page 2+ snap to page 1.
    if (isFirstSearchSync.current) {
      isFirstSearchSync.current = false;
      return;
    }
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  return (
    // One row below lg. Stacked, this cost three separate bands - the sheet
    // trigger, the search box and the control cluster - and pushed the first
    // cover to 42% of the viewport on a phone.
    <div className="flex flex-wrap items-center gap-2 lg:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leading}
        <Input
          placeholder="Filter by title or author..."
          value={localSearch}
          onChange={(e) => { setLocalSearch(e.target.value); }}
          className="h-9 min-w-0 flex-1 lg:h-8 lg:w-[250px] lg:flex-none"
        />
        {localSearch && (
          <Button
            variant="ghost"
            onClick={() => { setLocalSearch(""); }}
            className="h-9 shrink-0 px-2 lg:h-8"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Reading status and sort live in the filters sheet below lg - they
            are filters, and two more selects here wrapped to a second row. */}
        <div className={filtersInSheet ? "hidden lg:block" : undefined}>
          <Select value={filterValue} onValueChange={(v) => { onFilterChange(v as ReadingFilter); }}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showSort && (
          <div className={filtersInSheet ? "hidden lg:block" : undefined}>
            <Select value={sortValue} onValueChange={(v) => { onSortChange(v as SortValue); }}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="hidden items-center rounded-md border md:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onViewChange("grid"); }}
            aria-label="Grid view"
            data-active={view === "grid"}
            className="rounded-r-none data-[active=true]:bg-muted"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onViewChange("table"); }}
            aria-label="Table view"
            data-active={view === "table"}
            className="rounded-l-none data-[active=true]:bg-muted"
          >
            <Table2 className="size-4" />
          </Button>
        </div>
        {view === "grid" && onSelectModeChange && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Select works"
            aria-pressed={selectMode === true}
            onClick={() => { onSelectModeChange(selectMode !== true); }}
            className="rounded-md border data-[active=true]:bg-muted"
            data-active={selectMode === true}
          >
            <CheckSquare className="size-4" />
          </Button>
        )}
        {view === "grid" && tileSize && onTileSizeChange && (
          <div className="flex items-center rounded-md border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onTileSizeChange("small"); }}
              aria-label="Small tiles"
              data-active={tileSize === "small"}
              className="rounded-r-none data-[active=true]:bg-muted"
            >
              <Grid3x3 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onTileSizeChange("large"); }}
              aria-label="Large tiles"
              data-active={tileSize === "large"}
              className="rounded-l-none data-[active=true]:bg-muted"
            >
              <Grid2x2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
