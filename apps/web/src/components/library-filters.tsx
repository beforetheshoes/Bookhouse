import { Button } from "~/components/ui/button";
import { X } from "lucide-react";

export interface FacetCounts {
  format: { formatFamily: string; _count: { _all: number } }[];
  hasCover: { withCover: number; withoutCover: number };
  series: number;
}

export interface LibraryFilterValues {
  format?: string[];
  authorId?: string[];
  seriesId?: string[];
  publisher?: string[];
  hasCover?: boolean;
}

interface LibraryFiltersProps {
  facetCounts: FacetCounts;
  filters: LibraryFilterValues;
  onFiltersChange: (filters: LibraryFilterValues) => void;
}

function hasActiveFilters(filters: LibraryFilterValues): boolean {
  return (
    (filters.format !== undefined && filters.format.length > 0) ||
    filters.hasCover !== undefined ||
    (filters.authorId !== undefined && filters.authorId.length > 0) ||
    (filters.seriesId !== undefined && filters.seriesId.length > 0) ||
    (filters.publisher !== undefined && filters.publisher.length > 0)
  );
}

export function LibraryFilters({
  facetCounts,
  filters,
  onFiltersChange,
}: LibraryFiltersProps) {
  function toggleFormat(formatFamily: string) {
    const current = filters.format;
    if (current?.includes(formatFamily)) {
      onFiltersChange({ ...filters, format: undefined });
    } else {
      onFiltersChange({ ...filters, format: [formatFamily] });
    }
  }

  function toggleHasCover(value: boolean) {
    if (filters.hasCover === value) {
      onFiltersChange({ ...filters, hasCover: undefined });
    } else {
      onFiltersChange({ ...filters, hasCover: value });
    }
  }

  function clearAll() {
    onFiltersChange({});
  }

  return (
    <div className="space-y-4">
      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1">
          <X className="size-3" />
          Clear All
        </Button>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Format</h3>
        <div className="flex flex-wrap gap-1">
          {facetCounts.format.map((f) => (
            <Button
              key={f.formatFamily}
              variant="outline"
              size="sm"
              data-active={filters.format?.includes(f.formatFamily) ?? false}
              onClick={() => { toggleFormat(f.formatFamily); }}
              className="data-[active=true]:bg-accent"
            >
              {f.formatFamily} ({String(f._count._all)})
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Cover</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasCover === true}
            onClick={() => { toggleHasCover(true); }}
            className="data-[active=true]:bg-accent"
          >
            With Cover ({String(facetCounts.hasCover.withCover)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasCover === false}
            onClick={() => { toggleHasCover(false); }}
            className="data-[active=true]:bg-accent"
          >
            Without Cover ({String(facetCounts.hasCover.withoutCover)})
          </Button>
        </div>
      </div>
    </div>
  );
}
