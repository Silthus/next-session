import { Link } from "@tanstack/react-router";
import { cn } from "./cn";
import { Logo } from "./Logo";

type Size = "sm" | "md" | "lg";

const text: Record<Size, string> = { sm: "text-base", md: "text-lg", lg: "text-2xl" };
const logo: Record<Size, string> = { sm: "size-6", md: "size-7", lg: "size-9" };

export function Wordmark({ size = "md" }: { size?: Size }) {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-2.5 text-ink"
      aria-label="Next Session home"
    >
      <Logo className={logo[size]} />
      <span className={cn("font-display font-bold", text[size])}>Next Session</span>
    </Link>
  );
}
