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
  totalFacetCounts: FacetCounts;
  filters: LibraryFilterValues;
  onFiltersChange: (filters: LibraryFilterValues) => void;
}

function formatCount(filtered: number, total: number): string {
  return filtered === total ? String(filtered) : `${String(filtered)} / ${String(total)}`;
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
  totalFacetCounts,
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

  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="space-y-4">
      <div data-testid="clear-all-spacer" className="h-8">
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1">
            <X className="size-3" />
            Clear All
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Format</h3>
        <div className="flex flex-wrap gap-1">
          {facetCounts.format.map((f) => (
            <Button
              key={f.formatFamily}
              variant="outline"
              size="sm"
              data-active={filters.format?.includes(f.formatFamily) ?? false}
              data-empty={f._count._all === 0}
              onClick={() => { toggleFormat(f.formatFamily); }}
              className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
            >
              {f.formatFamily} ({formatCount(f._count._all, totalFacetCounts.format.find((t) => t.formatFamily === f.formatFamily)?._count._all ?? f._count._all)})
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
            data-empty={facetCounts.hasCover.withCover === 0}
            onClick={() => { toggleBoolean("hasCover", true); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            With Cover ({formatCount(facetCounts.hasCover.withCover, totalFacetCounts.hasCover.withCover)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasCover === false}
            data-empty={facetCounts.hasCover.withoutCover === 0}
            onClick={() => { toggleBoolean("hasCover", false); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            Without Cover ({formatCount(facetCounts.hasCover.withoutCover, totalFacetCounts.hasCover.withoutCover)})
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
            data-empty={facetCounts.enrichment.enriched === 0}
            onClick={() => { toggleBoolean("enriched", true); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            Enriched ({formatCount(facetCounts.enrichment.enriched, totalFacetCounts.enrichment.enriched)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.enriched === false}
            data-empty={facetCounts.enrichment.unenriched === 0}
            onClick={() => { toggleBoolean("enriched", false); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            Unenriched ({formatCount(facetCounts.enrichment.unenriched, totalFacetCounts.enrichment.unenriched)})
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
            data-empty={facetCounts.description.withDescription === 0}
            onClick={() => { toggleBoolean("hasDescription", true); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            Has Description ({formatCount(facetCounts.description.withDescription, totalFacetCounts.description.withDescription)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasDescription === false}
            data-empty={facetCounts.description.withoutDescription === 0}
            onClick={() => { toggleBoolean("hasDescription", false); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            No Description ({formatCount(facetCounts.description.withoutDescription, totalFacetCounts.description.withoutDescription)})
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
            data-empty={facetCounts.series.inSeries === 0}
            onClick={() => { toggleBoolean("inSeries", true); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            In Series ({formatCount(facetCounts.series.inSeries, totalFacetCounts.series.inSeries)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.inSeries === false}
            data-empty={facetCounts.series.standalone === 0}
            onClick={() => { toggleBoolean("inSeries", false); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            Standalone ({formatCount(facetCounts.series.standalone, totalFacetCounts.series.standalone)})
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
            data-empty={facetCounts.isbn.withIsbn === 0}
            onClick={() => { toggleBoolean("hasIsbn", true); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            Has ISBN ({formatCount(facetCounts.isbn.withIsbn, totalFacetCounts.isbn.withIsbn)})
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={filters.hasIsbn === false}
            data-empty={facetCounts.isbn.withoutIsbn === 0}
            onClick={() => { toggleBoolean("hasIsbn", false); }}
            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary dark:data-[active=true]:bg-primary dark:data-[active=true]:text-primary-foreground data-[empty=true]:opacity-50"
          >
            No ISBN ({formatCount(facetCounts.isbn.withoutIsbn, totalFacetCounts.isbn.withoutIsbn)})
          </Button>
        </div>
      </div>
    </div>
  );
}
