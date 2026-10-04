import { useId } from "react";
import type { Answer } from "../../../../shared/answers";
import type { IsoDate } from "../../../../shared/dates";
import type { PlayerRow, SessionRow } from "../../../../shared/monthSummary";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { Dot } from "../../../ui/Dot";
import { longDayLabel, relativeDay } from "./calendarDates";
import type { CalendarDay } from "./DayCell";
import { IconChevron, IconStar } from "./icons";

const answerLabels: Record<Answer, string> = { free: "Free", maybe: "Maybe", busy: "Busy" };
const answerTones: Record<Answer, string> = {
  free: "text-free",
  maybe: "text-maybe",
  busy: "text-busy",
};

export function DayPanel({
  day,
  playerCount,
  today,
  pending,
  onClose,
  onSchedule,
  onUnschedule,
  className,
}: {
  day: CalendarDay;
  playerCount: number;
  today: IsoDate;
  pending: boolean;
  onClose: () => void;
  onSchedule: () => void;
  onUnschedule: (session: SessionRow) => void;
  className?: string;
}) {
  const headingId = useId();
  return (
    <Card accent aria-labelledby={headingId} className={cn("animate-rise", className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="-ml-1 flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium text-ink-3 hover:text-ink"
        >
          <IconChevron direction="left" className="size-3.5" />
          Overview
        </button>
        <span className="text-xs text-ink-3">{relativeDay(day.date, today)}</span>
      </div>
      <h3 id={headingId} className="mt-2 font-display text-2xl font-bold">
        {longDayLabel(day.date)}
      </h3>
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
      <div className="mt-5">
        <SessionAction
          day={day}
          pending={pending}
          onSchedule={onSchedule}
          onUnschedule={onUnschedule}
        />
      </div>
    </Card>
  );
}

function Headline({ day }: { day: CalendarDay }) {
  return (
    <p className="mt-0.5 text-sm text-ink-2">
      <span className="font-semibold text-free">{`${String(day.free.length)} free`}</span>
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
    <ul className="mt-4 flex max-h-[min(22rem,40dvh)] flex-col gap-2 overflow-y-auto lg:max-h-none">
      {rows.map(({ player, answer }) => (
        <li key={player._id} className="flex items-center gap-2.5">
          <Avatar name={player.name} size="sm" />
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
  onUnschedule,
}: {
  day: CalendarDay;
  pending: boolean;
  onSchedule: () => void;
  onUnschedule: (session: SessionRow) => void;
}) {
  const busyLabel = pending ? "Saving…" : false;
  if (day.session === null) {
    return (
      <Button
        size="lg"
        className="w-full"
        disabled={!day.bookable}
        busy={busyLabel}
        onClick={onSchedule}
      >
        <IconStar />
        Schedule session
      </Button>
    );
  }
  if (!day.bookable) {
    return <p className="text-sm text-ink-3">You played this night. Past dates are read-only.</p>;
  }
  const session = day.session;
  return (
    <Button
      variant="secondary"
      className="w-full"
      busy={busyLabel}
      onClick={() => onUnschedule(session)}
    >
      Unschedule this session
    </Button>
  );
}
