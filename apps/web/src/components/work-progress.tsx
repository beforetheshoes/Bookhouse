import { ProgressBar } from "~/components/progress-bar";

interface WorkProgressProps {
  progress: { percent: number | null }[];
}

export function WorkProgress({ progress }: WorkProgressProps) {
  const maxPercent = Math.max(...progress.map((p) => p.percent ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ProgressBar percent={maxPercent} />
        </div>
        <span className="text-sm text-muted-foreground">{String(maxPercent)}%</span>
      </div>
    </div>
  );
}
