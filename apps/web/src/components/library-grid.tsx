import { useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { WorkCard } from "~/components/work-card";
import type { LibraryWork } from "~/lib/server-fns/library";

interface LibraryGridProps {
  works: LibraryWork[];
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

export function getColumnCount(width: number): number {
  if (width < 480) return 2;
  if (width < 640) return 3;
  if (width < 1024) return 4;
  if (width < 1280) return 5;
  return 6;
}

export function LibraryGrid({ works }: LibraryGridProps) {
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
          setColumnCount(getColumnCount(entry.contentRect.width));
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  const rowCount = works.length > 0 ? Math.ceil(works.length / columnCount) : 0;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 400,
    overscan: 3,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={containerRef}
      className="overflow-auto"
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
                    formats={getFormats(work)}
                    series={work.series?.name}
                    coverPath={work.coverPath}
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
