import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { ProgressBar } from "~/components/progress-bar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item";
/**
 * Only what a row draws. Structural rather than the full `LibraryWork` so the
 * component states its own needs - and so its tests can build a row without
 * standing up an entire Prisma payload.
 */
export interface LibraryListWork {
  id: string;
  titleDisplay: string;
  coverPath: string | null;
  series: { name: string } | null;
  editions: {
    formatFamily: string;
    contributors: { role: string; contributor: { nameDisplay: string } }[];
  }[];
}

interface LibraryListProps {
  works: LibraryListWork[];
  progressMap?: Record<string, number>;
  /** Select mode: rows toggle selection instead of opening. */
  selectable?: boolean;
  rowSelection?: Record<string, boolean>;
  onToggleSelect?: (id: string) => void;
  /** True while the fixed bulk bar is on screen. */
  selectionActive?: boolean;
  /** Infinite loading. Omit onLoadMore to render a plain, finite list. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/** Roughly one row: 64px cover + padding. Measured rows correct this. */
const ESTIMATED_ROW = 88;

function getAuthors(work: LibraryListWork): string {
  const authors = work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ") || "—";
}

function getFormats(work: LibraryListWork): string[] {
  return [...new Set(work.editions.map((e) => e.formatFamily))];
}

function RowBody({
  work,
  progress,
  selected,
}: {
  work: LibraryListWork;
  progress: number | undefined;
  selected: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverPath = work.coverPath;
  const formats = getFormats(work);

  return (
    <>
      <ItemMedia variant="image" className="size-16 shrink-0 rounded-sm bg-muted">
        {coverPath === null || imgFailed ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <BookOpen className="size-5" />
          </div>
        ) : (
          <img
            src={`/api/covers/${coverPath}/thumb.webp`}
            alt=""
            loading="lazy"
            className="size-full object-cover"
            onError={() => { setImgFailed(true); }}
          />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="[overflow-wrap:anywhere] line-clamp-2 text-sm font-medium">
          {work.titleDisplay}
        </ItemTitle>
        <ItemDescription className="[overflow-wrap:anywhere] line-clamp-1 text-xs">
          {getAuthors(work)}
        </ItemDescription>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {formats.map((format) => (
            <Badge key={format} variant="secondary" className="px-1.5 py-0 text-[10px]">
              {format}
            </Badge>
          ))}
          {work.series && (
            <Badge variant="outline" className="max-w-[45%] truncate px-1.5 py-0 text-[10px]">
              {work.series.name}
            </Badge>
          )}
        </div>
        {progress !== undefined && progress > 0 && (
          <div className="mt-1.5">
            <ProgressBar percent={progress} />
          </div>
        )}
      </ItemContent>
      {selected && (
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Check className="size-4" />
        </span>
      )}
    </>
  );
}

/**
 * The library as compact rows.
 *
 * The two-column grid fits about two books on a phone screen; these rows fit
 * six with the same cover, title, author, formats and progress. Rows are
 * virtualised against the window rather than an inner scrollport, so the page
 * scrolls the way a phone expects and the bulk bar stays where it is.
 */
export function LibraryList({
  works,
  progressMap,
  selectable,
  rowSelection,
  onToggleSelect,
  selectionActive,
  hasMore,
  loadingMore,
  onLoadMore,
}: LibraryListProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);

  // The window virtualiser measures from the top of the document, so it needs
  // to know where this list starts.
  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (node !== null) {
      setOffset(node.getBoundingClientRect().top + window.scrollY);
    }
  }, []);

  const setListNode = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); };
  }, [measure]);

  const virtualizer = useWindowVirtualizer({
    count: works.length,
    estimateSize: () => ESTIMATED_ROW,
    overscan: 6,
    scrollMargin: offset,
  });

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? 0;

  // Fetch the next page while the reader is still six rows from the end, so
  // the list does not visibly stall at the boundary.
  useEffect(() => {
    if (hasMore !== true || loadingMore === true || !onLoadMore) return;
    if (works.length === 0) return;
    if (lastIndex >= works.length - 6) onLoadMore();
  }, [lastIndex, works.length, hasMore, loadingMore, onLoadMore]);

  return (
    <div className={selectionActive === true ? "pb-48" : undefined}>
      <div ref={setListNode}>
        <ItemGroup
          data-testid="library-list"
          style={{ height: `${String(virtualizer.getTotalSize())}px`, position: "relative" }}
        >
          {items.map((virtualRow) => {
            const work = works[virtualRow.index];
            if (!work) return null;
            const selected = rowSelection?.[work.id] === true;
            const body = (
              <RowBody
                work={work}
                progress={progressMap?.[work.id]}
                selected={selected}
              />
            );
            return (
              <div
                key={work.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${String(virtualRow.start - offset)}px)`,
                }}
              >
                {/* A link or a checkbox, never one nested in the other. */}
                {selectable === true ? (
                  <Item
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={selected}
                    aria-label={`Select ${work.titleDisplay}`}
                    data-testid={`list-row-${work.id}`}
                    className="cursor-pointer items-start gap-3"
                    data-selected={selected}
                    onClick={() => { onToggleSelect?.(work.id); }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        onToggleSelect?.(work.id);
                      }
                    }}
                  >
                    {body}
                  </Item>
                ) : (
                  <Item asChild className="items-start gap-3">
                    <Link
                      to="/library/$workId"
                      params={{ workId: work.id }}
                      data-testid={`list-row-${work.id}`}
                    >
                      {body}
                    </Link>
                  </Item>
                )}
              </div>
            );
          })}
        </ItemGroup>
      </div>
      {loadingMore === true && (
        <div
          data-testid="library-list-loading"
          className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Loading more...
        </div>
      )}
    </div>
  );
}
