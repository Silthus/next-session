import { monthProgress, type Answer } from "./answers";
import { isBookable, monthDays, monthOf, type IsoDate, type IsoMonth } from "./dates";

export type PlayerRow = { _id: string; name: string };
export type AnswerRow<PlayerId extends string> = {
  playerId: PlayerId;
  date: IsoDate;
  answer: Answer;
};
export type SessionRow = { _id: string; date: IsoDate };

export type MonthSummaryInput<Player extends PlayerRow, Session extends SessionRow> = {
  month: IsoMonth;
  today: IsoDate;
  players: readonly Player[];
  answers: readonly AnswerRow<Player["_id"]>[];
  sessions: readonly Session[];
};

export type DaySummary<Player extends PlayerRow, Session extends SessionRow> = {
  date: IsoDate;
  past: boolean;
  bookable: boolean;
  free: Player[];
  maybe: Player[];
  busy: Player[];
  unanswered: Player[];
  heat: number;
  perfect: boolean;
  session: Session | null;
};

export type MonthSummary<Player extends PlayerRow, Session extends SessionRow> = {
  days: DaySummary<Player, Session>[];
  bestNights: DaySummary<Player, Session>[];
  progress: PlayerProgress<Player>[];
};

export type PlayerProgress<Player extends PlayerRow> = {
  player: Player;
  answered: number;
  fillable: number;
};

const BEST_NIGHTS_COUNT = 3;

export function summarizeMonth<Player extends PlayerRow, Session extends SessionRow>(
  input: MonthSummaryInput<Player, Session>,
): MonthSummary<Player, Session> {
  const answerOf = answerLookup(input.answers);
  const sessionOn = sessionLookup(input.month, input.sessions);
  const days = monthDays(input.month).map((date) =>
    summarizeDay(date, input, answerOf, sessionOn.get(date) ?? null),
  );
  return { days, bestNights: bestNights(days), progress: progressOf(input) };
}

function progressOf<Player extends PlayerRow, Session extends SessionRow>({
  month,
  today,
  players,
  answers,
}: MonthSummaryInput<Player, Session>): PlayerProgress<Player>[] {
  return players.map((player) => {
    const answered = new Set(answers.filter((a) => a.playerId === player._id).map((a) => a.date));
    return { player, ...monthProgress(month, today, answered) };
  });
}

function bestNights<Player extends PlayerRow, Session extends SessionRow>(
  days: readonly DaySummary<Player, Session>[],
): DaySummary<Player, Session>[] {
  return days
    .filter((day) => day.bookable && day.busy.length === 0 && nightScore(day) > 0)
    .sort((a, b) => nightScore(b) - nightScore(a) || a.date.localeCompare(b.date))
    .slice(0, BEST_NIGHTS_COUNT);
}

function nightScore(day: { free: readonly unknown[]; maybe: readonly unknown[] }): number {
  return day.free.length + day.maybe.length / 2;
}

function summarizeDay<Player extends PlayerRow, Session extends SessionRow>(
  date: IsoDate,
  { today, players }: MonthSummaryInput<Player, Session>,
  answerOf: AnswerLookup<Player["_id"]>,
  session: Session | null,
): DaySummary<Player, Session> {
  const playersAnswering = (value: Answer | null) =>
    players.filter((player) => answerOf(player._id, date) === value);
  const free = playersAnswering("free");
  const busy = playersAnswering("busy");
  const everyoneFree = players.length > 0 && free.length === players.length;
  return {
    date,
    past: date < today,
    bookable: isBookable(date, today),
    free,
    maybe: playersAnswering("maybe"),
    busy,
    unanswered: playersAnswering(null),
    heat: busy.length > 0 || players.length === 0 ? 0 : free.length / players.length,
    perfect: everyoneFree,
    session,
  };
}

type AnswerLookup<PlayerId extends string> = (playerId: PlayerId, date: IsoDate) => Answer | null;

function answerLookup<PlayerId extends string>(
  answers: readonly AnswerRow<PlayerId>[],
): AnswerLookup<PlayerId> {
  const byKey = new Map(answers.map((row) => [`${row.playerId}|${row.date}`, row.answer]));
  return (playerId, date) => byKey.get(`${playerId}|${date}`) ?? null;
}

function sessionLookup<Session extends SessionRow>(
  month: IsoMonth,
  sessions: readonly Session[],
): Map<IsoDate, Session> {
  return new Map(
    sessions.filter((session) => monthOf(session.date) === month).map((s) => [s.date, s]),
  );
}
