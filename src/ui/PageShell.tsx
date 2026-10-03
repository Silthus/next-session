import type { ReactNode } from "react";
import { cn } from "./cn";
import { LegalFooter } from "./LegalFooter";
import { Wordmark } from "./Wordmark";

type MaxWidth = "md" | "2xl";

const maxWidths: Record<MaxWidth, string> = { md: "max-w-md", "2xl": "max-w-2xl" };

export function PageShell({
  maxWidth = "2xl",
  headerEnd,
  centerFooter = false,
  className,
  children,
}: {
  maxWidth?: MaxWidth;
  headerEnd?: ReactNode;
  centerFooter?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const column = cn("mx-auto w-full px-4 sm:px-6", maxWidths[maxWidth]);
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
