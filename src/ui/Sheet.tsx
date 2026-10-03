import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

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
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) showModal(dialog);
    else closeModal(dialog);
  }, [open]);

  const rememberPress = (event: PointerEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open && !dialogRef.current?.open) onClose();
      }}
      onPointerDown={rememberPress}
      onClick={closeOnBackdrop}
      className="animate-fade fixed inset-0 m-0 hidden h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden overscroll-contain bg-transparent p-0 backdrop:bg-ink/40 open:flex sm:items-center"
    >
      {open && (
        <div className="animate-rise max-h-dvh w-full overflow-y-auto overscroll-contain rounded-t-xl border border-line bg-surface p-6 text-ink shadow-card sm:max-w-md sm:rounded-xl">
          <h2 id={titleId} className="font-display text-2xl font-bold">
            {title}
          </h2>
          <div className="mt-4">{children}</div>
        </div>
      )}
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
