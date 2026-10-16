import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LegalFooter } from "../../ui/LegalFooter";
import { Logo } from "../../ui/Logo";

export function GroupFrame({
  heading,
  actions,
  children,
}: {
  heading: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Next Session home" className="shrink-0">
            <Logo />
          </Link>
          {heading && (
            <span className="text-ink-3" aria-hidden="true">
              /
            </span>
          )}
          {heading}
          {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-x-clip px-4 py-4 sm:px-6 sm:py-6">
        {children}
      </main>
      <LegalFooter className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6" />
    </div>
  );
}
