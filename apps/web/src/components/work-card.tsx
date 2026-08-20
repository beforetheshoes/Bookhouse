import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Check } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { ProgressBar } from "~/components/progress-bar";
import type { GridTileSize } from "~/hooks/use-grid-tile-size";

export interface WorkCardProps {
  id: string;
  title: string;
  authors: string;
  enrichmentStatus?: string;
  scanActive?: boolean;
  formats: string[];
  series?: string | null;
  coverPath?: string | null;
  progressPercent?: number | null;
  tileSize?: GridTileSize;
  /** Renders a full-card selection target instead of navigating on tap. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}

export function WorkCard({ id, title, authors, enrichmentStatus, scanActive, formats, series, coverPath, progressPercent, tileSize = "small", selectable, selected, onSelectChange }: WorkCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPlaceholder = !coverPath || imgFailed;
  const coverSize = tileSize === "large" ? "medium" : "thumb";
  const isSmall = tileSize === "small";

  const cardClass = "relative flex flex-col overflow-hidden rounded-lg border bg-card";

  // Either a link or a checkbox, never a control nested inside a link: nesting
  // is invalid HTML, leaves the link independently focusable (so Enter
  // navigates instead of selecting), and doubles the tab stops per card.
  const body = (
    <>
      <div className="relative aspect-[2/3] shrink-0 overflow-hidden bg-muted">
        {showPlaceholder ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <BookOpen className={isSmall ? "size-8" : "size-12"} />
          </div>
        ) : (
          <img
            src={`/api/covers/${id}/${coverSize}`}
            alt={title}
            loading="lazy"
            onError={() => { setImgFailed(true); }}
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>
      <div className={isSmall ? "space-y-0.5 p-2" : "space-y-1 p-3"}>
        <h3 className={isSmall ? "line-clamp-2 text-sm font-medium leading-tight md:text-xs" : "line-clamp-2 text-sm font-medium leading-tight"}>{title}</h3>
        <p className={isSmall ? "line-clamp-1 text-xs text-muted-foreground md:text-[10px]" : "line-clamp-1 text-xs text-muted-foreground"}>{authors}</p>
        <div className="flex flex-wrap gap-1">
          {formats.map((f) => (
            <Badge key={f} variant="secondary" className={isSmall ? "px-1 py-0 text-[10px] md:text-[8px]" : "px-1.5 py-0 text-[10px]"}>
              {f}
            </Badge>
          ))}
          {series && (
            <Badge data-testid="series-badge" title={series} variant="outline" className={isSmall ? "truncate px-1 py-0 text-[10px] md:text-[8px]" : "truncate px-1.5 py-0 text-[10px]"}>
              {series}
            </Badge>
          )}
          {enrichmentStatus === "STUB" && scanActive && (
            <Badge variant="outline" className={isSmall ? "animate-pulse px-1 py-0 text-[10px] md:text-[8px]" : "animate-pulse px-1.5 py-0 text-[10px]"}>
              Processing&hellip;
            </Badge>
          )}
        </div>
      </div>
      <ProgressBar percent={progressPercent} size="md" />
    </>
  );

  if (selectable === true) {
    return (
      <div
        role="checkbox"
        tabIndex={0}
        aria-checked={selected === true}
        aria-label={`Select ${title}`}
        onClick={() => { onSelectChange?.(selected !== true); }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onSelectChange?.(selected !== true);
          }
        }}
        className={`${cardClass} cursor-pointer ${selected === true ? "ring-2 ring-primary ring-inset" : ""}`}
      >
        <span
          className={`absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-md border-2 bg-background/90 ${selected === true ? "border-primary text-primary" : "border-muted-foreground/50"}`}
        >
          {selected === true && <Check className="size-4" />}
        </span>
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/library/$workId"
      params={{ workId: id }}
      search={{ page: 1, pageSize: 50, sort: "title-asc" as const }}
      className={cardClass}
    >
      {body}
    </Link>
  );
}
