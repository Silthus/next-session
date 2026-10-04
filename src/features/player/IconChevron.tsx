import { cn } from "../../ui/cn";

export function IconChevron({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", direction === "left" ? "rotate-90" : "-rotate-90", className)}
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
