import { LayoutGrid, Table2, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import type { LibraryView } from "~/hooks/use-library-view-preference";

export type SortValue = "title-asc" | "title-desc" | "author-asc" | "author-desc" | "publisher-asc" | "publisher-desc" | "format-asc" | "format-desc" | "isbn-asc" | "isbn-desc" | "recent";

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
  { value: "publisher-asc", label: "Publisher A-Z" },
  { value: "publisher-desc", label: "Publisher Z-A" },
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
}: LibraryToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2">
        <Input
          placeholder="Search title or author..."
          value={searchValue}
          onChange={(e) => { onSearchChange(e.target.value); }}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {searchValue && (
          <Button
            variant="ghost"
            onClick={() => { onSearchChange(""); }}
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
      </div>
    </div>
  );
}
