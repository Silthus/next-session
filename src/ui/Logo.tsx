import { cn } from "./cn";

export function Logo({ className, muted = false }: { className?: string; muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", muted && "opacity-40 grayscale", className)}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="28" height="28" rx="9" className="fill-accent" />
      <path d="M11 2h10a9 9 0 0 1 9 9H2a9 9 0 0 1 9-9z" className="fill-accent-strong" />
      <circle cx="16" cy="20" r="5" className="fill-accent-ink" />
    </svg>
  );
}
