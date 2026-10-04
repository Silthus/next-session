import { Link } from "@tanstack/react-router";
import { pageTitle } from "../lib/pageTitle";
import { buttonClassName, type ButtonSize } from "./Button";
import { Logo } from "./Logo";
import { PageShell } from "./PageShell";
import { useFocusOnMount } from "./useFocusOnMount";

export type NotFoundKind = "page" | "link";

type NotFoundCopy = {
  headline: string;
  explanation: string;
  ownsTitle: boolean;
  ctaSize: ButtonSize;
};

const copies: Record<NotFoundKind, NotFoundCopy> = {
  page: {
    headline: "Nothing here",
    explanation: "The page you were looking for does not exist.",
    ownsTitle: false,
    ctaSize: "md",
  },
  link: {
    headline: "This link no longer works",
    explanation:
      "The GM may have rotated the link or deleted the group. Ask them for the current one.",
    ownsTitle: true,
    ctaSize: "lg",
  },
};

export function NotFoundScreen({ kind }: { kind: NotFoundKind }) {
  const { headline, explanation, ownsTitle, ctaSize } = copies[kind];
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center justify-center gap-5 text-center"
    >
      {ownsTitle && <title>{pageTitle(headline)}</title>}
      <Logo muted className="size-14" />
      <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-extrabold outline-none">
        {headline}
      </h1>
      <p className="text-ink-2">{explanation}</p>
      <div className="mt-2 flex flex-col items-center gap-2">
        <Link to="/" className={buttonClassName("secondary", ctaSize)}>
          Plan your own game
        </Link>
        <span className="text-xs text-ink-3">One click, no sign-up.</span>
      </div>
    </PageShell>
  );
}
