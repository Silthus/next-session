import { fillRestDates, monthProgress, type Answer } from "../../../shared/answers";
import {
  addMonths,
  bookingWindow,
  isBookable,
  isValidMonth,
  monthDays,
  monthOf,
  type IsoDate,
  type IsoMonth,
} from "../../../shared/dates";

export type PlayerDay = {
  date: IsoDate;
  dayOfMonth: number;
  answer: Answer | null;
  locked: boolean;
  isToday: boolean;
  session: boolean;
};

export type PlayerMonthInput = {
  month: IsoMonth;
  today: IsoDate;
  answers: Record<IsoDate, Answer>;
  sessionDates: IsoDate[];
};

export function visibleMonth(requested: string | undefined, today: IsoDate): IsoMonth {
  const valid = requested !== undefined && isValidMonth(requested);
  return valid && requested <= lastBookableMonth(today) ? requested : monthOf(today);
}

export function playerMonth({ month, today, answers, sessionDates }: PlayerMonthInput) {
  const answered = new Set(Object.keys(answers));
  const sessions = new Set(sessionDates.filter((date) => isBookable(date, today)));
  const progress = monthProgress(month, today, answered);
  return {
    month,
    label: monthLabel(month),
    readOnly: month < monthOf(today),
    leadingBlanks: mondayFirstWeekday(`${month}-01`),
    days: monthDays(month).map((date): PlayerDay => ({
      date,
      dayOfMonth: Number(date.slice(8, 10)),
      answer: answers[date] ?? null,
      locked: !isBookable(date, today),
      isToday: date === today,
      session: sessions.has(date),
    })),
    progress,
    done: progress.fillable > 0 && progress.answered === progress.fillable,
    fillRest: fillRestDates(month, today, answered),
    previousMonth: addMonths(month, -1),
    nextMonth: month < lastBookableMonth(today) ? addMonths(month, 1) : null,
  };
}

export type PlayerMonth = ReturnType<typeof playerMonth>;

export function monthName(month: IsoMonth): string {
  return formatUtc(`${month}-01`, { month: "long" });
}

export function dayLabel(date: IsoDate): string {
  return formatUtc(date, { weekday: "long", month: "long", day: "numeric" });
}

function monthLabel(month: IsoMonth): string {
  return formatUtc(`${month}-01`, { month: "long", year: "numeric" });
}

function lastBookableMonth(today: IsoDate): IsoMonth {
  return monthOf(bookingWindow(today).last);
}

function mondayFirstWeekday(date: IsoDate): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function formatUtc(date: IsoDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
