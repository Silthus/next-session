import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Answer } from "../../../../shared/answers";
import type { IsoDate } from "../../../../shared/dates";
import type { PlayerRow } from "../../../../shared/monthSummary";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { Dot } from "../../../ui/Dot";
import { longDayLabel, relativeDay } from "./calendarDates";
import type { CalendarDay, CalendarSession } from "./DayCell";
import { IconChevron, IconClock, IconStar } from "../../../ui/icons";
import { focusRing, hoverRow } from "../../../ui/interactive";
import { timeRange, type WallClockTime } from "../../../lib/timeAndPlace";

const answerLabels: Record<Answer, string> = { free: "Free", maybe: "Maybe", busy: "Busy" };
const answerTones: Record<Answer, string> = {
  free: "text-ink-2 dark:text-free",
  maybe: "text-ink-2 dark:text-maybe",
  busy: "text-ink-2 dark:text-busy",
};

export function DayPanel({
  day,
  playerCount,
  today,
  pending,
  timeAndPlace,
  closeLabel,
  focusHeading = false,
  onClose,
  onSchedule,
  onCancel,
  onOpenTimeAndPlace,
  className,
}: {
  day: CalendarDay;
  playerCount: number;
  today: IsoDate;
  pending: boolean;
  timeAndPlace: TimeAndPlace;
  closeLabel: ReactNode;
  focusHeading?: boolean;
  onClose: () => void;
  onSchedule: () => void;
  onCancel: (session: CalendarSession) => void;
  onOpenTimeAndPlace: () => void;
  className?: string;
}) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);
  return (
    <Card accent aria-labelledby={headingId} className={className}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "-ml-2 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-ink-2 hover:text-ink",
            hoverRow,
          )}
        >
          <IconChevron direction="left" className="size-4" />
          {closeLabel}
        </button>
        <span className="text-xs text-ink-3">{relativeDay(day.date, today)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          ref={heading}
          id={headingId}
          tabIndex={-1}
          data-day-heading
          className="font-display text-2xl font-semibold outline-none"
        >
          {longDayLabel(day.date)}
        </h3>
        {day.cancelled && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
            Cancelled
          </span>
        )}
      </div>
      {playerCount === 0 ? (
        <p className="mt-1 text-sm text-ink-3">
          No players yet. They show up here once they open your link.
        </p>
      ) : (
        <>
          <Headline day={day} />
          <PlayerAnswers day={day} />
        </>
      )}
      <div className="mt-5 flex flex-col gap-2">
        {day.bookable && !day.session && (
          <CalendarLine
            timeAndPlace={
              day.cancelled ? { ...day.cancelled, timeZone: timeAndPlace.timeZone } : timeAndPlace
            }
            onChange={onOpenTimeAndPlace}
          />
        )}
        <SessionAction day={day} pending={pending} onSchedule={onSchedule} onCancel={onCancel} />
      </div>
    </Card>
  );
}

type TimeAndPlace = WallClockTime & { location?: string };

function CalendarLine({
  timeAndPlace,
  onChange,
}: {
  timeAndPlace: TimeAndPlace;
  onChange: () => void;
}) {
  const range = timeRange(timeAndPlace);
  const shown = timeAndPlace.location ? `${range} · ${timeAndPlace.location}` : range;
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
      <IconClock className="shrink-0 text-ink-3" />
      <p className="min-w-0 flex-1">{`Players' calendars will show ${shown}`}</p>
      <button
        type="button"
        aria-label="Change time and place"
        onClick={onChange}
        className={cn(
          "shrink-0 rounded-sm font-semibold text-accent-strong underline-offset-2 hover:underline",
          focusRing,
        )}
      >
        Change
      </button>
    </div>
  );
}

function Headline({ day }: { day: CalendarDay }) {
  return (
    <p className="mt-0.5 text-sm text-ink-2">
      <span className="font-semibold text-ink dark:text-free">{`${String(day.free.length)} free`}</span>
      {` · ${String(day.maybe.length)} maybe · ${String(day.busy.length)} busy · ${String(day.unanswered.length)} silent`}
    </p>
  );
}

function PlayerAnswers({ day }: { day: CalendarDay }) {
  const rows: { player: PlayerRow; answer: Answer | null }[] = [
    ...(["free", "maybe", "busy"] as const).flatMap((answer) =>
      day[answer].map((player) => ({ player, answer })),
    ),
    ...day.unanswered.map((player) => ({ player, answer: null })),
  ];
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {rows.map(({ player, answer }) => (
        <li key={player._id} className="flex items-center gap-2.5">
          <Avatar name={player.name} image={player.image} size="sm" />
          <span
            className={cn("min-w-0 flex-1 truncate text-sm font-medium", !answer && "text-ink-3")}
          >
            {player.name}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold",
              answer ? answerTones[answer] : "text-ink-3",
            )}
          >
            <Dot answer={answer} />
            {answer ? answerLabels[answer] : "No answer"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SessionAction({
  day,
  pending,
  onSchedule,
  onCancel,
}: {
  day: CalendarDay;
  pending: boolean;
  onSchedule: () => void;
  onCancel: (session: CalendarSession) => void;
}) {
  const session = day.session;
  if (!day.bookable && (session || day.cancelled)) {
    return <p className="text-sm text-ink-3">{readOnlyLine(day)}</p>;
  }
  const act = () => {
    if (pending) return;
    if (session) onCancel(session);
    else onSchedule();
  };
  return (
    <Button
      size="lg"
      variant={session ? "secondary" : "primary"}
      className="w-full"
      disabled={!day.bookable}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={act}
    >
      {pending ? "Saving…" : <ActionLabel day={day} />}
    </Button>
  );
}

function readOnlyLine(day: CalendarDay) {
  if (day.cancelled) return "This night was cancelled. Past dates are read-only.";
  return "You played this night. Past dates are read-only.";
}

function ActionLabel({ day }: { day: CalendarDay }) {
  if (day.session) return "Cancel session";
  return (
    <>
      <IconStar />
      {day.cancelled ? "Schedule again" : "Schedule session"}
    </>
  );
}
