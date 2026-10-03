import type { ReactNode } from "react";

export function Toast({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div
      role="status"
      className="animate-rise fixed bottom-20 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-card"
    >
      {children}
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="font-semibold text-paper underline underline-offset-2"
        >
          {action}
        </button>
      )}
    </div>
  );
}
