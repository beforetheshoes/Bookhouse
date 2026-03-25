import { Button } from "~/components/ui/button";
import { X } from "lucide-react";

export interface FacetCounts {
  format: { formatFamily: string; _count: { _all: number } }[];
  hasCover: { withCover: number; withoutCover: number };
  enrichment: { enriched: number; unenriched: number };
  description: { withDescription: number; withoutDescription: number };
  series: { inSeries: number; standalone: number };
  isbn: { withIsbn: number; withoutIsbn: number };
}

export interface LibraryFilterValues {
  format?: string[];
  authorId?: string[];
  seriesId?: string[];
  publisher?: string[];
  hasCover?: boolean;
  enriched?: boolean;
  hasDescription?: boolean;
  inSeries?: boolean;
  hasIsbn?: boolean;
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
    filters.enriched !== undefined ||
    filters.hasDescription !== undefined ||
    filters.inSeries !== undefined ||
    filters.hasIsbn !== undefined ||
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

  function toggleBoolean(key: keyof LibraryFilterValues, value: boolean) {
    if (filters[key] === value) {
      onFiltersChange({ ...filters, [key]: undefined });
    } else {
      onFiltersChange({ ...filters, [key]: value });
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
            onClick={() => { toggleBoolean("hasCover", true); }}
            className="data-[active=true]:bg-accent"
          >
            With Cover ({String(facetCounts.hasCover.withCover)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasCover === false}
            onClick={() => { toggleBoolean("hasCover", false); }}
            className="data-[active=true]:bg-accent"
          >
            Without Cover ({String(facetCounts.hasCover.withoutCover)})
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Enrichment</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            data-active={filters.enriched === true}
            onClick={() => { toggleBoolean("enriched", true); }}
            className="data-[active=true]:bg-accent"
          >
            Enriched ({String(facetCounts.enrichment.enriched)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.enriched === false}
            onClick={() => { toggleBoolean("enriched", false); }}
            className="data-[active=true]:bg-accent"
          >
            Unenriched ({String(facetCounts.enrichment.unenriched)})
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Description</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasDescription === true}
            onClick={() => { toggleBoolean("hasDescription", true); }}
            className="data-[active=true]:bg-accent"
          >
            Has Description ({String(facetCounts.description.withDescription)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasDescription === false}
            onClick={() => { toggleBoolean("hasDescription", false); }}
            className="data-[active=true]:bg-accent"
          >
            No Description ({String(facetCounts.description.withoutDescription)})
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Series</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            data-active={filters.inSeries === true}
            onClick={() => { toggleBoolean("inSeries", true); }}
            className="data-[active=true]:bg-accent"
          >
            In Series ({String(facetCounts.series.inSeries)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.inSeries === false}
            onClick={() => { toggleBoolean("inSeries", false); }}
            className="data-[active=true]:bg-accent"
          >
            Standalone ({String(facetCounts.series.standalone)})
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">ISBN</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasIsbn === true}
            onClick={() => { toggleBoolean("hasIsbn", true); }}
            className="data-[active=true]:bg-accent"
          >
            Has ISBN ({String(facetCounts.isbn.withIsbn)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasIsbn === false}
            onClick={() => { toggleBoolean("hasIsbn", false); }}
            className="data-[active=true]:bg-accent"
          >
            No ISBN ({String(facetCounts.isbn.withoutIsbn)})
          </Button>
        </div>
      </div>
    </div>
  );
}
