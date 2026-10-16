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
import type { SessionState } from "../../../shared/sessions";

export type PlayerDay = {
  date: IsoDate;
  dayOfMonth: number;
  answer: Answer | null;
  locked: boolean;
  isToday: boolean;
  session: boolean;
  cancelled: boolean;
};

type DatedSession = { date: IsoDate; state: SessionState };

export type PlayerSession = DatedSession & {
  startTime: string;
  lengthMinutes: number;
  location?: string;
};

export type PlayerMonthInput = {
  month: IsoMonth;
  today: IsoDate;
  answers: Record<IsoDate, Answer>;
  sessions: DatedSession[];
};

export function visibleMonth(requested: string | undefined, today: IsoDate): IsoMonth {
  const valid = requested !== undefined && isValidMonth(requested);
  return valid && requested <= lastBookableMonth(today) ? requested : monthOf(today);
}

export function playerMonth({ month, today, answers, sessions }: PlayerMonthInput) {
  const answered = new Set(Object.keys(answers));
  const stateOn = new Map(
    sessions.filter(({ date }) => isBookable(date, today)).map(({ date, state }) => [date, state]),
  );
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
      session: stateOn.get(date) === "scheduled",
      cancelled: stateOn.get(date) === "cancelled",
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
