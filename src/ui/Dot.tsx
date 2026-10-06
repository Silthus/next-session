import { cn } from "./cn";

export type DotAnswer = "free" | "maybe" | "busy" | null;

const colors: Record<Exclude<DotAnswer, null>, string> = {
  free: "bg-free",
  maybe: "bg-maybe-bar",
  busy: "bg-busy",
};

export function Dot({ answer, className }: { answer: DotAnswer; className?: string }) {
  return (
    <span
      role="img"
      aria-label={answer ?? "unanswered"}
      className={cn(
        "inline-block size-2 rounded-full",
        answer ? colors[answer] : "bg-line-strong",
        className,
      )}
    />
  );
}
