import { playerInitials } from "../../shared/names";
import { cn } from "./cn";

const hues = [
  "bg-accent-soft text-accent-strong",
  "bg-accent text-accent-ink",
  "bg-surface-2 text-ink",
  "bg-ink text-paper",
];

type Size = "xs" | "sm" | "md";

const sizes: Record<Size, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
};

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        hueFor(name),
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {playerInitials(name)}
    </span>
  );
}

function hueFor(name: string) {
  const hash = [...name.toLowerCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return hues[hash % hues.length];
}
