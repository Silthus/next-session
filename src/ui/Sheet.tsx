import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.open = true;
  }, [open]);
  if (!open) return null;

  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={closeOnBackdrop}
      className="animate-fade fixed inset-0 m-0 flex h-dvh w-full max-w-none max-h-none items-end justify-center bg-transparent p-0 backdrop:bg-ink/40 sm:items-center"
    >
      <div className="animate-rise w-full rounded-t-xl border border-line bg-surface p-6 text-ink shadow-card sm:max-w-md sm:rounded-xl">
        <h2 id={titleId} className="font-display text-2xl font-bold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
