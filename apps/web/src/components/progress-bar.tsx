export function ProgressBar({ percent }: { percent: number | null | undefined }) {
  if (percent == null) return null;

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={`h-full transition-all ${percent >= 100 ? "bg-green-500" : "bg-primary"}`}
        style={{ width: `${String(percent)}%` }}
      />
    </div>
  );
}
