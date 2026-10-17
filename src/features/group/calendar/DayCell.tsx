import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Answer } from "../../../../shared/answers";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import type { DaySummary, PlayerRow } from "../../../../shared/monthSummary";
import { cn } from "../../../ui/cn";
import { longDayLabel, weekdayColumn } from "./calendarDates";
import { IconStar, IconStarCancelled } from "../../../ui/icons";

export type CalendarSession = NonNullable<
  FunctionReturnType<typeof api.schedule.month>
>["sessions"][number];
export type CalendarDay = DaySummary<PlayerRow, CalendarSession>;

export const MAX_PLAYERS_WITH_BARS = 8;
export const MAX_TINT_PERCENT = 55;

export function DayCell({
  day,
  players,
  today,
  selected,
  detailOpen = false,
  onToggle,
}: {
  day: CalendarDay;
  players: readonly PlayerRow[];
  today: string;
  selected: boolean;
  detailOpen?: boolean;
  onToggle: () => void;
}) {
  const perfect = day.perfect && day.session === null;
  const isToday = day.date === today;
  const whoId = useId();
  const [whoDismissed, setWhoDismissed] = useState(false);
  const who = players.length > 0 && !day.past && !whoDismissed && !detailOpen;
  const dismissWho = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !who) return;
    event.stopPropagation();
    setWhoDismissed(true);
  };
  const showWhoAgain = () => setWhoDismissed(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onKeyDown={dismissWho}
      onMouseEnter={showWhoAgain}
      onFocus={showWhoAgain}
      disabled={day.past}
      aria-label={dayCellLabel(day, players.length)}
      aria-describedby={who ? whoId : undefined}
      aria-pressed={selected}
      aria-current={isToday ? "date" : undefined}
      data-date={day.date}
      style={tintOf(day)}
      className={cn(
        "group relative flex aspect-square min-w-0 flex-col justify-between rounded-sm border p-1 text-left transition-[scale,background-color,border-color] duration-150 ease-(--ease-snap) before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-ink/0 before:transition-colors before:duration-150 sm:rounded-md sm:p-2 sm:hover:before:bg-ink/6",
        cellTone(day),
        selected
          ? "z-10 outline-2 outline-offset-2 outline-ink focus-visible:outline-offset-4 focus-visible:outline-accent-strong max-sm:outline-offset-0 max-sm:focus-visible:outline-offset-0"
          : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong max-sm:focus-visible:outline-offset-0",
        day.past ? "cursor-default opacity-40" : "motion-safe:active:scale-[0.97]",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 text-sm font-semibold leading-none",
          isToday && isPlain(day) && "text-accent-strong",
          isToday &&
            "sm:-mx-1 sm:-my-0.5 sm:self-start sm:rounded-full sm:bg-accent sm:px-1.5 sm:py-0.5 sm:text-accent-ink",
        )}
      >
        {Number(day.date.slice(8))}
        {isToday && (
          <span
            className={cn("size-1.5 rounded-full sm:hidden", perfect ? "bg-current" : "bg-accent")}
          />
        )}
      </span>
      <SessionMark day={day} onSolidFree={perfect} />
      <DayAnswers day={day} players={players} onSolidFree={perfect} />
      {who && <DayWho id={whoId} day={day} />}
    </button>
  );
}

function SessionMark({ day, onSolidFree }: { day: CalendarDay; onSolidFree: boolean }) {
  const corner = "absolute top-1 right-1 sm:top-1.5 sm:right-1.5";
  if (day.session) {
    return (
      <span data-mark="session" className={corner}>
        <IconStar className="size-3 text-accent-strong sm:size-4" />
      </span>
    );
  }
  if (!day.cancelled) return null;
  const tone = cancelledTone(day, onSolidFree);
  return (
    <>
      <span data-mark="cancelled" className={cn(corner, tone)}>
        <IconStarCancelled className="size-3 sm:size-4" />
      </span>
      <span
        className={cn(
          "font-mono text-[10px] leading-none font-semibold tracking-wide uppercase max-sm:hidden",
          tone,
        )}
      >
        Cancelled
      </span>
    </>
  );
}

function cancelledTone(day: CalendarDay, onSolidFree: boolean) {
  if (onSolidFree) return "text-current";
  return day.heat > 0 ? "text-ink" : "text-ink-3";
}

const NAMES_SHOWN = 6;

const whoRows = [
  { label: "Free", tone: "bg-free", of: (day: CalendarDay) => day.free },
  { label: "Maybe", tone: "bg-maybe-bar", of: (day: CalendarDay) => day.maybe },
  { label: "Busy", tone: "bg-busy", of: (day: CalendarDay) => day.busy },
  {
    label: "No answer",
    tone: "border border-paper/60",
    of: (day: CalendarDay) => (day.bookable ? day.unanswered : []),
  },
];

function DayWho({ id, day }: { id: string; day: CalendarDay }) {
  const rows = whoRows
    .map((row) => ({ ...row, players: row.of(day) }))
    .filter((row) => row.players.length > 0);
  return (
    <span
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute top-full z-20 hidden w-max max-w-60 pt-1.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:opacity-100 lg:block",
        weekdayColumn(day.date) < 4 ? "left-0" : "right-0",
      )}
    >
      <span className="flex flex-col gap-1 rounded-md bg-ink px-2.5 py-2 text-left text-xs leading-snug font-medium text-paper shadow-card">
        {rows.map((row) => (
          <span key={row.label} className="flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className={cn("mt-1 size-2 shrink-0 rounded-full", row.tone)}
            />
            <span className="min-w-0 wrap-anywhere">
              <span className="text-paper/70">{row.label}</span> {namesOf(row.players)}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

function namesOf(players: readonly PlayerRow[]) {
  const shown = players.slice(0, NAMES_SHOWN).map((player) => player.name);
  const hidden = players.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} +${String(hidden)}` : shown.join(", ");
}

function isPlain(day: CalendarDay) {
  return day.session === null && !day.perfect && day.heat === 0;
}

function cellTone(day: CalendarDay) {
  if (day.session) return "border-accent bg-accent-soft ring-2 ring-accent ring-inset";
  if (day.perfect) return "border-free bg-free text-white dark:text-paper";
  return "border-line bg-surface hover:border-line-strong sm:hover:border-ink-3";
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

const barShape = "h-3 w-1 rounded-full sm:w-[5px]";

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
  const parts = [answerSummary(day, playerCount), sessionSummary(day)].filter(Boolean);
  const date = longDayLabel(day.date);
  return parts.length === 0 ? date : `${date}: ${parts.join(", ")}`;
}

function sessionSummary(day: CalendarDay) {
  if (day.session) return "Session scheduled";
  if (day.cancelled) return "Session cancelled";
  return null;
}

function answerSummary(day: CalendarDay, playerCount: number) {
  if (playerCount === 0) return null;
  if (day.perfect) return "everyone free";
  const answered = `${String(day.free.length)} free, ${String(day.maybe.length)} maybe, ${String(day.busy.length)} busy`;
  const missing = missingCount(day);
  return missing === 0 ? answered : `${answered}, ${String(missing)} not answered`;
}
