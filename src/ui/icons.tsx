import { cn } from "./cn";

export function IconCopy({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

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

const chevronTurns = {
  down: "",
  up: "rotate-180",
  left: "rotate-90",
  right: "-rotate-90",
} as const;

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

export function IconMore({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", className)}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="10" cy="4.5" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="10" cy="15.5" r="1.6" />
    </svg>
  );
}

export function IconClose({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
