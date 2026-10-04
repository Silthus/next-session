import { cn } from "../../../ui/cn";

export function IconStar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", className)}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.8L10 14.8l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z" />
    </svg>
  );
}

const chevronTurns = { left: "rotate-90", right: "-rotate-90" } as const;

export function IconChevron({
  direction,
  className,
}: {
  direction: keyof typeof chevronTurns;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", chevronTurns[direction], className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  );
}
