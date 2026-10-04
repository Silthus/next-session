import { Link } from "@tanstack/react-router";
import { pageTitle } from "../../lib/pageTitle";
import { buttonClassName } from "../../ui/Button";
import { Logo } from "../../ui/Logo";
import { PageShell } from "../../ui/PageShell";

const HEADLINE = "This link no longer works";

export function LinkGone() {
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center justify-center gap-5 text-center"
    >
      <title>{pageTitle(HEADLINE)}</title>
      <Logo muted className="size-14" />
      <h1 className="font-display text-3xl font-extrabold">{HEADLINE}</h1>
      <p className="text-ink-2">
        The GM may have rotated the link or deleted the group. Ask them for the current one.
      </p>
      <div className="mt-2 flex flex-col items-center gap-2">
        <Link to="/" className={buttonClassName("secondary")}>
          Plan your own game
        </Link>
        <span className="text-xs text-ink-3">One click, no sign-up.</span>
      </div>
    </PageShell>
  );
}
