import type { IsoDate } from "../../../../shared/dates";

export function focusDay(date: IsoDate) {
  const cell = dayCellOf(date);
  if (cell && !cell.matches(":disabled")) cell.focus();
  else if (!focusDayHeading(date)) focusMonthHeading();
}

export function focusDayHeading(date: IsoDate) {
  const heading = document.querySelector<HTMLElement>(`[data-day-heading="${date}"]`);
  heading?.focus();
  return heading !== null;
}

export function focusMonthHeading() {
  document.querySelector<HTMLElement>("[data-month-heading]")?.focus();
}

function dayCellOf(date: IsoDate) {
  return document.querySelector<HTMLElement>(`[data-date="${date}"]`);
}
