import { playerInitials } from "../../shared/names";
import { cn } from "./cn";
import { ProfileImage } from "./ProfileImage";

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
  image,
  size = "md",
  className,
}: {
  name: string;
  image?: string;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        hueFor(name),
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      <ProfileImage src={image} fallback={playerInitials(name)} className="size-full" />
    </span>
  );
}

function hueFor(name: string) {
  const hash = [...name.toLowerCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return hues[hash % hues.length];
}
