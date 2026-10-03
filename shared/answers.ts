import { isBookable, monthDays, type IsoDate, type IsoMonth } from "./dates";

export const ANSWERS = ["free", "maybe", "busy"] as const;
export type Answer = (typeof ANSWERS)[number];

export function nextAnswer(answer: Answer | null): Answer | null {
  switch (answer) {
    case null:
      return "free";
    case "free":
      return "maybe";
    case "maybe":
      return "busy";
    case "busy":
      return null;
  }
}

export function fillRestDates(
  month: IsoMonth,
  today: IsoDate,
  answered: ReadonlySet<IsoDate>,
): IsoDate[] {
  return fillableDates(month, today).filter((date) => !answered.has(date));
}

export function monthProgress(
  month: IsoMonth,
  today: IsoDate,
  answered: ReadonlySet<IsoDate>,
): { answered: number; fillable: number } {
  const fillable = fillableDates(month, today);
  return {
    answered: fillable.filter((date) => answered.has(date)).length,
    fillable: fillable.length,
  };
}

function fillableDates(month: IsoMonth, today: IsoDate): IsoDate[] {
  return monthDays(month).filter((date) => isBookable(date, today));
}
