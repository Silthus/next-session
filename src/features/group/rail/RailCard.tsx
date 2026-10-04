import { useId, type ReactNode } from "react";
import { Card } from "../../../ui/Card";

export function RailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <Card aria-labelledby={headingId}>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h2
          id={headingId}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-3"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-ink-3">{children}</p>;
}
