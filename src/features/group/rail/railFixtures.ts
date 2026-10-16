import type { Id } from "../../../../convex/_generated/dataModel";
import type { Answer } from "../../../../shared/answers";
import { summarizeMonth } from "../../../../shared/monthSummary";
import type { CalendarSession } from "../calendar/DayCell";

export const today = "2026-10-02";

export function rosterOf(...names: string[]) {
  return names.map((name) => ({ _id: name, name }));
}

export function monthWith({
  month = "2026-10",
  players = rosterOf("Ana", "Ben", "Chiara", "Dev", "Eli"),
  answers = {},
  sessions = [],
  cancelled = [],
}: {
  month?: string;
  players?: { _id: string; name: string }[];
  answers?: Record<string, Record<string, Answer>>;
  sessions?: string[];
  cancelled?: string[];
}) {
  return summarizeMonth({
    month,
    today,
    players,
    answers: Object.entries(answers).flatMap(([date, byPlayer]) =>
      Object.entries(byPlayer).map(([playerId, answer]) => ({ playerId, date, answer })),
    ),
    sessions: [
      ...sessions.map((date) => sessionOn(date, "scheduled")),
      ...cancelled.map((date) => sessionOn(date, "cancelled")),
    ],
  });
}

export function sessionOn(date: string, state: CalendarSession["state"]): CalendarSession {
  return {
    _id: `s-${date}` as Id<"sessions">,
    date,
    state,
    published: true,
    startTime: "19:00",
    lengthMinutes: 240,
  };
}
