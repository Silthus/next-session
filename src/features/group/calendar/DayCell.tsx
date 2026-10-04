import type { CSSProperties } from "react";
import type { Answer } from "../../../../shared/answers";
import type { DaySummary, PlayerRow, SessionRow } from "../../../../shared/monthSummary";
import { cn } from "../../../ui/cn";
import { longDayLabel } from "./calendarDates";
import { IconStar } from "./icons";

export type CalendarDay = DaySummary<PlayerRow, SessionRow>;

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
      style={tintOf(day)}
      className={cn(
        "relative flex aspect-square min-w-0 flex-col justify-between overflow-hidden rounded-sm border p-1.5 text-left transition-[transform,background-color,border-color] duration-150 ease-(--ease-snap) sm:rounded-md sm:p-2",
        "border-line bg-surface hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        perfect && "border-free bg-free text-white dark:text-paper",
        day.session && "border-accent bg-accent-soft ring-2 ring-accent ring-inset",
        selected && "z-10 outline-2 outline-offset-2 outline-ink focus-visible:outline-ink",
        day.past ? "cursor-default opacity-40" : "active:scale-[0.97]",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-semibold leading-none sm:text-sm",
          isToday && !perfect && "text-accent",
        )}
      >
        {Number(day.date.slice(8))}
        {isToday && <span className="size-1.5 rounded-full bg-current" />}
      </span>
      {day.session && (
        <IconStar className="absolute top-1 right-1 size-3 text-accent sm:top-1.5 sm:right-1.5 sm:size-4" />
      )}
      <DayAnswers day={day} players={players} onSolidFree={perfect} />
    </button>
  );
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
    return (
      <span
        className={cn(
          "font-mono text-[10px] leading-none tabular-nums sm:text-[11px]",
          onSolidFree ? "text-current" : "text-ink-2",
        )}
      >
        <span>{`${String(day.free.length)}/${String(players.length)}`}</span>
        {day.busy.length > 0 && (
          <span className="ml-1 text-busy">{`✕${String(day.busy.length)}`}</span>
        )}
      </span>
    );
  }
  const answerOf = answersByPlayer(day);
  return (
    <span className="flex flex-wrap gap-0.5">
      {players.map((player) => (
        <span
          key={player._id}
          data-bar
          className={cn(
            "h-2.5 w-1 rounded-full sm:h-3 sm:w-[5px]",
            barTone(answerOf.get(player._id) ?? null, onSolidFree),
          )}
        />
      ))}
    </span>
  );
}

const barTones: Record<Answer, string> = { free: "bg-free", maybe: "bg-maybe", busy: "bg-busy" };

function barTone(answer: Answer | null, onSolidFree: boolean) {
  if (onSolidFree) return "bg-white/85 dark:bg-paper/70";
  return answer ? barTones[answer] : "bg-line-strong/70";
}

function answersByPlayer(day: CalendarDay) {
  const answers = new Map<string, Answer>();
  for (const answer of ["free", "maybe", "busy"] as const) {
    for (const player of day[answer]) answers.set(player._id, answer);
  }
  return answers;
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
  return `${String(day.free.length)} free, ${String(day.maybe.length)} maybe, ${String(day.busy.length)} busy`;
}
