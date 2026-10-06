import type { ReactNode } from "react";
import { pageTitle } from "../lib/pageTitle";
import { Logo } from "./Logo";
import { PageShell } from "./PageShell";
import { useFocusOnMount } from "./useFocusOnMount";

export function StatusScreen({
  headline,
  explanation,
  children,
}: {
  headline: string;
  explanation: string;
  children: ReactNode;
}) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center justify-center gap-5 text-center"
    >
      <title>{pageTitle(headline)}</title>
      <Logo muted className="size-14" />
      <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-extrabold outline-none">
        {headline}
      </h1>
      <p className="text-ink-2">{explanation}</p>
      {children}
    </PageShell>
  );
}
