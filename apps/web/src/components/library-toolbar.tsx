import { useEffect, useState } from "react";
import { Grid2x2, Grid3x3, LayoutGrid, Table2, X } from "lucide-react";
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

export type SortValue = "title-asc" | "title-desc" | "author-asc" | "author-desc" | "format-asc" | "format-desc" | "recent";

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
}: LibraryToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debouncedSearch = useDebounce(localSearch, 300);

  useEffect(() => {
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2">
        <Input
          placeholder="Filter by title or author..."
          value={localSearch}
          onChange={(e) => { setLocalSearch(e.target.value); }}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {localSearch && (
          <Button
            variant="ghost"
            onClick={() => { setLocalSearch(""); }}
            className="h-8 px-2"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
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
        {showSort && (
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
        )}
        <div className="flex items-center rounded-md border">
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
