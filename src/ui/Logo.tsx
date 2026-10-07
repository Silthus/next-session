import { BRAND_GOLD, L_BODY, L_FLOURISH } from "./brand/paths";
import { cn } from "./cn";

export function Logo({ className, muted = false }: { className?: string; muted?: boolean }) {
  return (
    <svg
      viewBox="46 47 376 449"
      fill={BRAND_GOLD}
      className={cn("size-8", muted && "opacity-40 grayscale", className)}
      aria-hidden="true"
    >
      <path d={L_BODY} />
      <path d={L_FLOURISH} />
    </svg>
  );
}
