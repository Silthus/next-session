import type { ReactNode } from "react";
import { cn } from "./cn";

type ToastPosition = "bottom" | "top";

const positions: Record<ToastPosition, string> = {
  bottom: "bottom-20",
  top: "top-20",
};

export function Toast({
  children,
  action,
  onAction,
  position = "bottom",
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  position?: ToastPosition;
}) {
  return (
    <div
      role="status"
      className={cn(
        "animate-rise fixed left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-card",
        positions[position],
      )}
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
