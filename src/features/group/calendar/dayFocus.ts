import type { IsoDate } from "../../../../shared/dates";

export function focusDay(date: IsoDate) {
  const cell = dayCellOf(date);
  if (cell && !cell.matches(":disabled")) cell.focus();
  else focusMonthHeading();
}

export function focusMonthHeading() {
  document.querySelector<HTMLElement>("[data-month-heading]")?.focus();
}

export function dayCellOf(date: IsoDate) {
  return document.querySelector<HTMLElement>(`[data-date="${date}"]`);
}
