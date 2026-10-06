import type { CSSProperties } from "react";
import type { Answer } from "../../../../shared/answers";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { IsoDate } from "../../../../shared/dates";
import type { DaySummary, PlayerRow } from "../../../../shared/monthSummary";
import { cn } from "../../../ui/cn";
import { longDayLabel } from "./calendarDates";
import { IconStar } from "../../../ui/icons";

export type CalendarSession = { _id: Id<"sessions">; date: IsoDate };
export type CalendarDay = DaySummary<PlayerRow, CalendarSession>;

export const MAX_PLAYERS_WITH_BARS = 8;
const MAX_TINT_PERCENT = 55;

export function DayCell({
  day,
  players,
  today,
  selected,
  onToggle,
}: {
  day: CalendarDay;
  players: readonly PlayerRow[];
  today: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const perfect = day.perfect && day.session === null;
  const isToday = day.date === today;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={day.past}
      aria-label={dayCellLabel(day, players.length)}
      aria-pressed={selected}
      aria-current={isToday ? "date" : undefined}
      data-date={day.date}
      style={tintOf(day)}
      className={cn(
        "relative flex aspect-square min-w-0 flex-col justify-between overflow-hidden rounded-sm border p-1.5 text-left transition-[transform,background-color,border-color] duration-150 ease-(--ease-snap) sm:rounded-md sm:p-2",
        cellTone(day),
        selected
          ? "z-10 outline-2 outline-offset-2 outline-ink focus-visible:outline-offset-4 focus-visible:outline-accent-strong"
          : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
        day.past ? "cursor-default opacity-40" : "active:scale-[0.97]",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-semibold leading-none sm:text-sm",
          isToday && isPlain(day) && "text-accent-strong",
        )}
      >
        {Number(day.date.slice(8))}
        {isToday && (
          <span className={cn("size-1.5 rounded-full", perfect ? "bg-current" : "bg-accent")} />
        )}
      </span>
      {day.session && (
        <IconStar className="absolute top-1 right-1 size-3 text-accent-strong sm:top-1.5 sm:right-1.5 sm:size-4" />
      )}
      <DayAnswers day={day} players={players} onSolidFree={perfect} />
    </button>
  );
}

function isPlain(day: CalendarDay) {
  return day.session === null && !day.perfect && day.heat === 0;
}

function cellTone(day: CalendarDay) {
  if (day.session) return "border-accent bg-accent-soft ring-2 ring-accent ring-inset";
  if (day.perfect) return "border-free bg-free text-white dark:text-paper";
  return "border-line bg-surface hover:border-line-strong";
}

function DayAnswers({
  day,
  players,
  onSolidFree,
}: {
  day: CalendarDay;
  players: readonly PlayerRow[];
  onSolidFree: boolean;
}) {
  if (players.length === 0) return null;
  if (players.length > MAX_PLAYERS_WITH_BARS) {
    return <DayCounts day={day} playerCount={players.length} onSolidFree={onSolidFree} />;
  }
  const answerOf = answersByPlayer(day);
  return (
    <span className="flex flex-wrap gap-0.5">
      {players.map((player) => {
        const answer = answerOf.get(player._id) ?? null;
        if (answer === null && !day.bookable) return null;
        return (
          <span
            key={player._id}
            data-bar={answer ?? "unanswered"}
            className={cn(barShape, barTone(answer, onSolidFree))}
          />
        );
      })}
    </span>
  );
}

function DayCounts({
  day,
  playerCount,
  onSolidFree,
}: {
  day: CalendarDay;
  playerCount: number;
  onSolidFree: boolean;
}) {
  const missing = missingCount(day);
  return (
    <span
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[10px] leading-none tabular-nums sm:text-[11px]",
        onSolidFree ? "text-current" : "text-ink",
      )}
    >
      <span data-count="free">
        {day.free.length}
        <span className="max-sm:hidden">{`/${String(playerCount)}`}</span>
      </span>
      {day.busy.length > 0 && (
        <span data-count="busy" className="text-busy">{`✕${String(day.busy.length)}`}</span>
      )}
      {missing > 0 && (
        <span data-count="unanswered" className="flex items-center gap-px">
          <UnansweredMark />
          {missing}
        </span>
      )}
    </span>
  );
}

export function UnansweredMark() {
  return (
    <span aria-hidden="true" className={cn("h-2 w-1 shrink-0 rounded-full", unansweredBarTone)} />
  );
}

const barShape = "h-2.5 w-1 rounded-full sm:h-3 sm:w-[5px]";

const barTones: Record<Answer, string> = {
  free: "bg-free",
  maybe: "bg-maybe-bar",
  busy: "bg-busy",
};

export const unansweredBarTone = "border border-ink-3";

function barTone(answer: Answer | null, onSolidFree: boolean) {
  if (onSolidFree) return "bg-white/85 dark:bg-paper/70";
  return answer ? barTones[answer] : unansweredBarTone;
}

function answersByPlayer(day: CalendarDay) {
  const answers = new Map<string, Answer>();
  for (const answer of ["free", "maybe", "busy"] as const) {
    for (const player of day[answer]) answers.set(player._id, answer);
  }
  return answers;
}

function missingCount(day: CalendarDay) {
  return day.bookable ? day.unanswered.length : 0;
}

function tintOf(day: CalendarDay): CSSProperties | undefined {
  if (day.session || day.perfect || day.heat === 0) return undefined;
  const percent = Math.round(day.heat * MAX_TINT_PERCENT);
  return { background: `color-mix(in oklab, var(--free) ${String(percent)}%, var(--surface))` };
}

export function dayCellLabel(day: CalendarDay, playerCount: number): string {
  const parts = [answerSummary(day, playerCount), day.session && "Session scheduled"].filter(
    Boolean,
  );
  const date = longDayLabel(day.date);
  return parts.length === 0 ? date : `${date}: ${parts.join(", ")}`;
}

function answerSummary(day: CalendarDay, playerCount: number) {
  if (playerCount === 0) return null;
  if (day.perfect) return "everyone free";
  const answered = `${String(day.free.length)} free, ${String(day.maybe.length)} maybe, ${String(day.busy.length)} busy`;
  const missing = missingCount(day);
  return missing === 0 ? answered : `${answered}, ${String(missing)} not answered`;
}
