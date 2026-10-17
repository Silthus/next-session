import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { monthOf, type IsoDate } from "../../../../shared/dates";
import { cn } from "../../../ui/cn";
import { leadingBlanks, weekdayColumn } from "./calendarDates";

const staysOpenOn = '[data-date], [role="status"], dialog';

export function DayPopover({
  date,
  onDismiss,
  children,
}: {
  date: IsoDate;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    popover.current?.scrollIntoView?.({ block: "nearest" });
  }, [date]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (popover.current?.contains(event.target) || event.target.closest(staysOpenOn)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [onDismiss]);

  const { column, row } = gridSlotOf(date);
  return (
    <div
      ref={popover}
      style={{ gridColumn: column + 1, gridRow: row + 2 } satisfies CSSProperties}
      className={cn(
        "absolute z-30 w-[22rem] animate-rise",
        column < 4 ? "left-full ml-3" : "right-full mr-3",
        row < 3 ? "top-0" : "bottom-0",
      )}
    >
      {children}
    </div>
  );
}

function gridSlotOf(date: IsoDate) {
  const column = weekdayColumn(date);
  const row = Math.floor((leadingBlanks(monthOf(date)) + Number(date.slice(8)) - 1) / 7);
  return { column, row };
}
