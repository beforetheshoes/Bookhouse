import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
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
}

export function WorkCard({ id, title, authors, enrichmentStatus, scanActive, formats, series, coverPath, progressPercent, tileSize = "small" }: WorkCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPlaceholder = !coverPath || imgFailed;
  const coverSize = tileSize === "large" ? "medium" : "thumb";
  const isSmall = tileSize === "small";

  return (
    <Link to="/library/$workId" params={{ workId: id }} search={{ page: 1, pageSize: 50, sort: "title-asc" as const }} className="flex flex-col overflow-hidden rounded-lg border bg-card">
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
        <h3 className={isSmall ? "line-clamp-2 text-xs font-medium leading-tight" : "line-clamp-2 text-sm font-medium leading-tight"}>{title}</h3>
        <p className={isSmall ? "line-clamp-1 text-[10px] text-muted-foreground" : "line-clamp-1 text-xs text-muted-foreground"}>{authors}</p>
        <div className="flex flex-wrap gap-1">
          {formats.map((f) => (
            <Badge key={f} variant="secondary" className={isSmall ? "px-1 py-0 text-[8px]" : "px-1.5 py-0 text-[10px]"}>
              {f}
            </Badge>
          ))}
          {series && (
            <Badge data-testid="series-badge" variant="outline" className={isSmall ? "px-1 py-0 text-[8px]" : "px-1.5 py-0 text-[10px]"}>
              {series}
            </Badge>
          )}
          {enrichmentStatus === "STUB" && scanActive && (
            <Badge variant="outline" className={isSmall ? "animate-pulse px-1 py-0 text-[8px]" : "animate-pulse px-1.5 py-0 text-[10px]"}>
              Processing&hellip;
            </Badge>
          )}
        </div>
      </div>
      <ProgressBar percent={progressPercent} size="md" />
    </Link>
  );
}
