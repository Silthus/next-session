import {
  useEffect,
  useId,
  useReducer,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { IconClose } from "./icons";

export function Sheet({
  open,
  title,
  dismissible = true,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  dismissible?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const [reshowTick, reshow] = useReducer((tick: number) => tick + 1, 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) showModal(dialog);
    else closeModal(dialog);
  }, [open, reshowTick]);

  const requestClose = () => {
    if (dismissible) onClose();
  };

  const reportNativeClose = () => {
    if (!open || dialogRef.current?.open) return;
    requestClose();
    reshow();
  };

  const rememberPress = (event: PointerEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdrop.current && event.target === event.currentTarget) requestClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={reportNativeClose}
      onPointerDown={rememberPress}
      onClick={closeOnBackdrop}
      className="animate-fade fixed inset-0 m-0 hidden h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden overscroll-contain bg-transparent p-0 backdrop:bg-black/40 dark:backdrop:bg-black/70 open:flex sm:items-center"
    >
      {open && (
        <div className="animate-rise relative max-h-dvh w-full overflow-y-auto overscroll-contain rounded-t-xl border border-line bg-surface p-6 text-ink shadow-card sm:max-w-md sm:rounded-xl">
          <h2 id={titleId} className="min-w-0 pr-10 font-display text-2xl font-bold break-words">
            {title}
          </h2>
          <div className="mt-4">{children}</div>
          <CloseButton dismissible={dismissible} onClose={requestClose} />
        </div>
      )}
    </dialog>
  );
}

function CloseButton({ dismissible, onClose }: { dismissible: boolean; onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      aria-disabled={!dismissible || undefined}
      onClick={onClose}
      className="absolute top-4 right-3 inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-2"
    >
      <IconClose className="size-5" />
    </button>
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
