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

interface LibraryFiltersSheetProps {
  facetCounts: FacetCounts;
  totalFacetCounts: FacetCounts;
  filters: LibraryFilterValues;
  onFiltersChange: (filters: LibraryFilterValues) => void;
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
}: LibraryFiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden">
          <SlidersHorizontal className="mr-2 size-4" />
          Filters
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
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
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
