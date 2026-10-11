import type { IsoDate } from "../../../../shared/dates";

export function focusDay(date: IsoDate) {
  const cell = dayCellOf(date);
  const target = cell && !cell.matches(":disabled") ? cell : (monthHeading() ?? openDayHeading());
  target?.focus();
}

export function focusMonthHeading() {
  monthHeading()?.focus();
}

function dayCellOf(date: IsoDate) {
  return document.querySelector<HTMLElement>(`[data-date="${date}"]`);
}

function monthHeading() {
  return document.querySelector<HTMLElement>("[data-month-heading]");
}

function openDayHeading() {
  return document.querySelector<HTMLElement>("[data-day-heading]");
}
