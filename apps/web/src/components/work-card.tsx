import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Badge } from "~/components/ui/badge";

export interface WorkCardProps {
  id: string;
  title: string;
  authors: string;
  formats: string[];
  series?: string | null;
  coverPath?: string | null;
}

export function WorkCard({ id, title, authors, formats, series, coverPath }: WorkCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPlaceholder = !coverPath || imgFailed;

  return (
    <Link to="/library/$workId" params={{ workId: id }} className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="aspect-[2/3] bg-muted">
        {showPlaceholder ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <BookOpen className="size-12" />
          </div>
        ) : (
          <img
            src={`/api/covers/${id}/thumb`}
            alt={title}
            loading="lazy"
            onError={() => { setImgFailed(true); }}
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">{title}</h3>
        <p className="line-clamp-1 text-xs text-muted-foreground">{authors}</p>
        <div className="flex flex-wrap gap-1">
          {formats.map((f) => (
            <Badge key={f} variant="secondary" className="px-1.5 py-0 text-[10px]">
              {f}
            </Badge>
          ))}
          {series && (
            <Badge data-testid="series-badge" variant="outline" className="px-1.5 py-0 text-[10px]">
              {series}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
