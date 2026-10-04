import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "../../../ui/cn";

export type PopoverTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: () => void;
};

export type ClosePopover = (options?: { refocus: boolean }) => void;

const CloseContext = createContext<ClosePopover>(() => undefined);

export function useClosePopover(): ClosePopover {
  return useContext(CloseContext);
}

export function Popover({
  triggerRef,
  trigger,
  children,
  align = "start",
  className,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close: ClosePopover = ({ refocus } = { refocus: true }) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, triggerRef]);

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next !== null && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      {trigger({
        ref: triggerRef,
        "aria-expanded": open,
        "aria-controls": panelId,
        onClick: () => setOpen((shown) => !shown),
      })}
      {open && (
        <div
          id={panelId}
          className={cn(
            "animate-rise absolute top-full z-30 mt-1 rounded-lg border border-line bg-surface p-1.5 text-ink shadow-card",
            align === "start" ? "left-0" : "right-0",
            className,
          )}
        >
          <CloseContext value={close}>{children}</CloseContext>
        </div>
      )}
    </div>
  );
}

export const menuItemClassName =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50";

export function MenuButton({ onSelect, children }: { onSelect: () => void; children: ReactNode }) {
  const close = useClosePopover();
  return (
    <button
      type="button"
      className={menuItemClassName}
      onClick={() => {
        close({ refocus: false });
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
