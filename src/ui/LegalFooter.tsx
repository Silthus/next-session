import { Link } from "@tanstack/react-router";
import { cn } from "./cn";

const links = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/imprint", label: "Imprint" },
] as const;

export function LegalFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3", className)}
    >
      {links.map((link) => (
        <Link key={link.to} to={link.to} className="transition-colors hover:text-ink">
          {link.label}
        </Link>
      ))}
    </footer>
  );
}
