import { Link } from "@tanstack/react-router";
import { cn } from "./cn";
import { focusRing } from "./interactive";
import { Logo } from "./Logo";

type Size = "sm" | "md" | "lg";

const text: Record<Size, string> = { sm: "text-base", md: "text-lg", lg: "text-2xl" };
const logo: Record<Size, string> = { sm: "size-6", md: "size-8", lg: "size-10" };

export function Wordmark({ size = "md" }: { size?: Size }) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center gap-2 rounded-md text-ink", focusRing)}
      aria-label="Next Session home"
    >
      <Logo className={logo[size]} />
      <span className={cn("font-display font-semibold", text[size])}>Next Session</span>
    </Link>
  );
}
