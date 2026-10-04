import { cn } from "../../ui/cn";

export function Progress({ answered, fillable }: { answered: number; fillable: number }) {
  const percent = fillable === 0 ? 0 : Math.round((answered / fillable) * 100);
  const done = fillable > 0 && answered === fillable;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-mono tracking-[0.14em] text-ink-3 uppercase">
          {done ? "All nights set" : `${String(answered)} of ${String(fillable)} nights set`}
        </span>
        <span
          className={cn(
            "font-mono tabular-nums",
            done ? "font-semibold text-ink dark:text-free" : "text-ink-2",
          )}
        >
          {done ? "✓ done" : `${String(percent)}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Nights set"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-300 ease-out",
            done ? "bg-free" : "bg-accent",
          )}
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}
