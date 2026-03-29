import { useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { WorkCard } from "~/components/work-card";
import type { LibraryWork } from "~/lib/server-fns/library";
import type { GridTileSize } from "~/hooks/use-grid-tile-size";

interface LibraryGridProps {
  works: LibraryWork[];
  progressMap?: Record<string, number>;
  scanActive?: boolean;
  tileSize?: GridTileSize;
}

function getAuthors(work: LibraryWork): string {
  const authors = work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ") || "—";
}

function getFormats(work: LibraryWork): string[] {
  return [...new Set(work.editions.map((e) => e.formatFamily))];
}

export function getColumnCount(width: number, tileSize: GridTileSize = "small"): number {
  if (tileSize === "small") {
    if (width < 480) return 3;
    if (width < 640) return 4;
    if (width < 1024) return 6;
    if (width < 1280) return 7;
    return 8;
  }
  if (width < 480) return 2;
  if (width < 640) return 3;
  if (width < 1024) return 4;
  if (width < 1280) return 5;
  return 6;
}

export function LibraryGrid({ works, progressMap, scanActive, tileSize = "small" }: LibraryGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(5);
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    scrollRef.current = node ?? null;

    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setColumnCount(getColumnCount(entry.contentRect.width, tileSize));
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, [tileSize]);

  const rowCount = works.length > 0 ? Math.ceil(works.length / columnCount) : 0;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileSize === "small" ? 280 : 400,
    overscan: 3,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={containerRef}
      className="overflow-auto pr-2"
      style={{ maxHeight: "70vh" }}
    >
      {works.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          No results.
        </div>
      ) : (
        <div style={{ height: totalSize, position: "relative" }}>
          {virtualRows.map((virtualRow) => {
            const startIdx = virtualRow.index * columnCount;
            const rowWorks = works.slice(startIdx, startIdx + columnCount);
            return (
              <div
                key={virtualRow.index}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="grid gap-4 pb-4"
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  left: 0,
                  right: 0,
                  gridTemplateColumns: `repeat(${String(columnCount)}, 1fr)`,
                }}
              >
                {rowWorks.map((work) => (
                  <WorkCard
                    key={work.id}
                    id={work.id}
                    title={work.titleDisplay}
                    authors={getAuthors(work)}
                    enrichmentStatus={work.enrichmentStatus}
                    scanActive={scanActive}
                    formats={getFormats(work)}
                    series={work.series?.name}
                    coverPath={work.coverPath}
                    progressPercent={progressMap?.[work.id]}
                    tileSize={tileSize}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
