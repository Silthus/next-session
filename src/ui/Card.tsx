import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({
  accent = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { accent?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-surface p-4 shadow-card",
        accent ? "border-accent" : "border-line",
        className,
      )}
      {...props}
    />
  );
}
