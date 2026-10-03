import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-3",
        className,
      )}
      {...props}
    />
  );
}
