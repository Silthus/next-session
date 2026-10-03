import { Link } from "@tanstack/react-router";
import { buttonClassName } from "./Button";
import { Logo } from "./Logo";
import { PageShell } from "./PageShell";

export function NotFoundScreen() {
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center justify-center gap-5 text-center"
    >
      <Logo muted className="size-14" />
      <h1 className="font-display text-3xl font-extrabold">Nothing here</h1>
      <p className="text-ink-2">The page you were looking for does not exist.</p>
      <div className="mt-2 flex flex-col items-center gap-2">
        <Link to="/" className={buttonClassName("secondary")}>
          Plan your own game
        </Link>
        <span className="text-xs text-ink-3">One click, no sign-up.</span>
      </div>
    </PageShell>
  );
}
