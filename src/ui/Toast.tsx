import { cn } from "./cn";

type ToastPosition = "bottom" | "top";

export type ToastMessage = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

const positions: Record<ToastPosition, string> = {
  bottom: "bottom-20",
  top: "top-20",
};

export function Toast({
  message,
  position = "bottom",
}: {
  message: ToastMessage | null;
  position?: ToastPosition;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2",
        positions[position],
      )}
    >
      {message && <ToastPill key={message.id} message={message} />}
    </div>
  );
}

function ToastPill({ message }: { message: ToastMessage }) {
  return (
    <div className="animate-rise flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-card">
      {message.text}
      {message.action && (
        <button
          type="button"
          onClick={message.action.run}
          className="font-semibold text-paper underline underline-offset-2"
        >
          {message.action.label}
        </button>
      )}
    </div>
  );
}
