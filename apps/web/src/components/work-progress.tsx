import { ProgressBar } from "~/components/progress-bar";
import { Badge } from "~/components/ui/badge";

interface WorkProgressProps {
  progress: { percent: number | null; source?: string | null }[];
}

export function WorkProgress({ progress }: WorkProgressProps) {
  const progressBySource = new Map<string, number>();

  for (const entry of progress) {
    const source = (entry.source ?? "manual").toLowerCase();
    const percent = entry.percent ?? 0;
    progressBySource.set(source, Math.max(progressBySource.get(source) ?? 0, percent));
  }

  const rows = [...progressBySource.entries()];
  return (
    <div className="space-y-2">
      {rows.map(([source, percent]) => (
        <div key={source} className="space-y-1">
          {rows.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs">via {source}</Badge>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ProgressBar percent={percent} />
            </div>
            <span className="text-sm text-muted-foreground">{String(percent)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
