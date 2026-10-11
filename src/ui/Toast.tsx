export type ToastMessage = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

export function Toast({ message }: { message: ToastMessage | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2"
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
          className="rounded-sm font-semibold text-paper underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
        >
          {message.action.label}
        </button>
      )}
    </div>
  );
}
