import type { ReactNode } from "react";
import { cn } from "./cn";
import { LegalFooter } from "./LegalFooter";
import { Wordmark } from "./Wordmark";

type Width = "narrow" | "legal";

const widths: Record<Width, string> = { narrow: "max-w-md", legal: "max-w-2xl" };

export function PageShell({
  width = "legal",
  headerEnd,
  centerFooter = false,
  className,
  children,
}: {
  width?: Width;
  headerEnd?: ReactNode;
  centerFooter?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const column = cn("mx-auto w-full px-4 sm:px-6", widths[width]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className={cn(column, "flex items-center justify-between py-5")}>
        <Wordmark />
        {headerEnd}
      </header>
      <main className={cn(column, "flex-1 pb-16", className)}>{children}</main>
      <LegalFooter className={cn(column, "pb-6", centerFooter && "justify-center")} />
    </div>
  );
}
