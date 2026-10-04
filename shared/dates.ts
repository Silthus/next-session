export type IsoDate = string;
export type IsoMonth = string;

const BOOKABLE_MONTHS_AHEAD = 2;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_SHAPE = /^\d{4}-\d{2}$/;

export function todayUtc(now: number): IsoDate {
  return new Date(now).toISOString().slice(0, 10);
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function addMonths(month: IsoMonth, n: number): IsoMonth {
  const { year, monthIndex } = parseMonth(month);
  return formatMonth(new Date(Date.UTC(year, monthIndex + n, 1)));
}

export function monthDays(month: IsoMonth): IsoDate[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad2(i + 1)}`);
}

export function bookingWindow(today: IsoDate): { first: IsoDate; last: IsoDate } {
  const lastMonth = addMonths(monthOf(today), BOOKABLE_MONTHS_AHEAD);
  return { first: today, last: `${lastMonth}-${pad2(daysInMonth(lastMonth))}` };
}

export function isBookable(date: IsoDate, today: IsoDate): boolean {
  const { first, last } = bookingWindow(today);
  return isValidDate(date) && first <= date && date <= last;
}

export function isBookableMonth(month: string, today: IsoDate): boolean {
  const { first, last } = bookingWindow(today);
  return isValidMonth(month) && monthOf(first) <= month && month <= monthOf(last);
}

export function isValidDate(value: string): boolean {
  if (!DATE_SHAPE.test(value)) return false;
  const month = monthOf(value);
  const day = Number(value.slice(8, 10));
  return isValidMonth(month) && day >= 1 && day <= daysInMonth(month);
}

export function isValidMonth(value: string): boolean {
  if (!MONTH_SHAPE.test(value)) return false;
  const { monthIndex } = parseMonth(value);
  return monthIndex >= 0 && monthIndex <= 11;
}

function daysInMonth(month: IsoMonth): number {
  const { year, monthIndex } = parseMonth(month);
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function parseMonth(month: IsoMonth): { year: number; monthIndex: number } {
  return { year: Number(month.slice(0, 4)), monthIndex: Number(month.slice(5, 7)) - 1 };
}

function formatMonth(date: Date): IsoMonth {
  return `${String(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
