import { useEffect, useId, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";

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
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closedByBrowser = () => onCloseRef.current();
    dialog.addEventListener("close", closedByBrowser);
    showModal(dialog);
    return () => {
      dialog.removeEventListener("close", closedByBrowser);
      closeModal(dialog);
    };
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
      className="animate-fade fixed inset-0 m-0 flex h-dvh max-h-none w-full max-w-none items-end justify-center bg-transparent p-0 backdrop:bg-ink/40 sm:items-center"
    >
      <div className="animate-rise max-h-dvh w-full overflow-y-auto rounded-t-xl border border-line bg-surface p-6 text-ink shadow-card sm:max-w-md sm:rounded-xl">
        <h2 id={titleId} className="font-display text-2xl font-bold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}

function showModal(dialog: HTMLDialogElement) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.open = true;
}

function closeModal(dialog: HTMLDialogElement) {
  if (!dialog.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.open = false;
}
