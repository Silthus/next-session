import { useEffect, useRef, useState, type ReactNode } from "react";
import type { IsoDate } from "../../../../shared/dates";
import { dayCellOf } from "./dayFocus";

export function MobileDaySheet({ date, children }: { date: IsoDate; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = sheet.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cell = dayCellOf(date);
    if (cell && height > 0) revealAbove(cell, height);
  }, [date, height]);

  return (
    <>
      <div aria-hidden="true" style={{ height }} className="lg:hidden" />
      <div ref={sheet} className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <div className="mx-auto max-h-[55dvh] max-w-lg overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  );
}

const SHEET_GAP_PX = 12;

function revealAbove(element: HTMLElement, sheetHeight: number) {
  const visibleBottom = window.innerHeight - sheetHeight - SHEET_GAP_PX;
  const overlap = element.getBoundingClientRect().bottom - visibleBottom;
  if (overlap > 0) window.scrollBy({ top: overlap });
}
