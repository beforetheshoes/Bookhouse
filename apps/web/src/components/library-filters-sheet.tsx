import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import {
  LibraryFilters,
  type FacetCounts,
  type LibraryFilterValues,
} from "~/components/library-filters";
import { countActiveFilters } from "~/lib/library-filter-helpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import type { SortValue } from "~/components/library-toolbar";

const STATUS_OPTIONS: { value: ReadingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Currently Reading" },
  { value: "finished", label: "Finished" },
  { value: "unread", label: "Unread" },
];

const SHEET_SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "title-asc", label: "Title A-Z" },
  { value: "title-desc", label: "Title Z-A" },
  { value: "author-asc", label: "Author A-Z" },
  { value: "author-desc", label: "Author Z-A" },
  { value: "recent", label: "Recently Added" },
];

interface LibraryFiltersSheetProps {
  facetCounts: FacetCounts;
  totalFacetCounts: FacetCounts;
  filters: LibraryFilterValues;
  onFiltersChange: (filters: LibraryFilterValues) => void;
  /** Reading status, shown here below lg where the toolbar has no room. */
  filterValue: ReadingFilter;
  onFilterChange: (value: ReadingFilter) => void;
  /** Sort, same reason. Omit when the view sorts by its own column headers. */
  sortValue?: SortValue;
  onSortChange?: (value: SortValue) => void;
}

/**
 * The library facet filters, reachable on phones.
 *
 * Below `lg` the desktop 224px rail is hidden and this trigger takes its
 * place. The sheet is deliberately uncontrolled: people set several facets in
 * one pass, so closing on the first selection would be hostile.
 *
 * Rendering `LibraryFilters` here as well as in the rail is safe because the
 * component is stateless — everything it shows derives from `filters`, which
 * comes from the URL — and a closed sheet renders no DOM at all.
 */
export function LibraryFiltersSheet({
  facetCounts,
  totalFacetCounts,
  filters,
  onFiltersChange,
  filterValue,
  onFilterChange,
  sortValue,
  onSortChange,
}: LibraryFiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Filters"
          className="shrink-0 px-2 lg:hidden"
        >
          <SlidersHorizontal className="size-4 sm:mr-2" />
          {/* The word costs 48px of a 328px row; the icon and the count carry
              it on a phone. */}
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span
              data-testid="active-filter-count"
              className="ml-2 rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
            >
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] sm:max-w-none md:max-w-sm">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8">
          <div className="space-y-2">
            <p className="text-sm font-medium">Status</p>
            <Select
              value={filterValue}
              onValueChange={(v) => { onFilterChange(v as ReadingFilter); }}
            >
              <SelectTrigger className="w-full" aria-label="Reading status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sortValue !== undefined && onSortChange !== undefined && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Sort</p>
              <Select
                value={sortValue}
                onValueChange={(v) => { onSortChange(v as SortValue); }}
              >
                <SelectTrigger className="w-full" aria-label="Sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHEET_SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <LibraryFilters
            facetCounts={facetCounts}
            totalFacetCounts={totalFacetCounts}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
