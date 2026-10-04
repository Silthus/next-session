import {
  bookingWindow,
  isValidDate,
  isValidMonth,
  monthOf,
  type IsoDate,
  type IsoMonth,
} from "../../../../shared/dates";

const DAY_MS = 86_400_000;

export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export function leadingBlanks(month: IsoMonth): number {
  const sundayFirst = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  return (sundayFirst + 6) % 7;
}

export function monthLabel(month: IsoMonth): string {
  return formatUtc(`${month}-01`, { month: "long", year: "numeric" });
}

export function dayLabel(date: IsoDate): string {
  return formatUtc(date, { weekday: "short", month: "short", day: "numeric" });
}

export function nightLabel(date: IsoDate): string {
  return formatUtc(date, { weekday: "long", month: "short", day: "numeric" });
}

export function longDayLabel(date: IsoDate): string {
  return formatUtc(date, { weekday: "long", month: "long", day: "numeric" });
}

export function relativeDay(date: IsoDate, today: IsoDate): string {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${String(days)} days` : `${String(-days)} days ago`;
}

export function lastVisibleMonth(today: IsoDate): IsoMonth {
  return monthOf(bookingWindow(today).last);
}

export function visibleMonth(requested: string | undefined, today: IsoDate): IsoMonth {
  if (requested === undefined || !isValidMonth(requested)) return monthOf(today);
  const last = lastVisibleMonth(today);
  return requested > last ? last : requested;
}

export function visibleDay(requested: string | undefined, month: IsoMonth): IsoDate | null {
  if (requested === undefined || !isValidDate(requested)) return null;
  return monthOf(requested) === month ? requested : null;
}

function formatUtc(date: IsoDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
