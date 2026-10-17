import { useEffect, useRef, type ReactNode } from "react";
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
      style={{ gridColumn: `${column + 1} / span 1`, gridRow: `${row + 2} / span 1` }}
      className={cn(
        "absolute top-0 z-30 max-h-[calc(100dvh-6rem)] w-[22rem] scroll-mt-20 scroll-mb-4 overflow-y-auto rounded-xl shadow-xl animate-rise",
        column < 4 ? "left-full ml-3" : "right-full mr-3",
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
