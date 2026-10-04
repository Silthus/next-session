import type { IsoDate } from "../../../../shared/dates";

export function focusDay(date: IsoDate) {
  const cell = dayCellOf(date);
  const target = cell && !cell.matches(":disabled") ? cell : monthHeading();
  target?.focus();
}

function monthHeading() {
  return document.querySelector<HTMLElement>("[data-month-heading]");
}

export function dayCellOf(date: IsoDate) {
  return document.querySelector<HTMLElement>(`[data-date="${date}"]`);
}
