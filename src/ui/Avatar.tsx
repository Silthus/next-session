import { cn } from "./cn";

export function playerInitials(name: string) {
  const [first = "", second] = name.trim().split(/\s+/);
  const letters = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return letters.toUpperCase();
}

const hues = [
  "bg-accent-soft text-accent",
  "bg-free-soft text-free",
  "bg-maybe-soft text-maybe",
  "bg-busy-soft text-busy",
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
