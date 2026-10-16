import { useId, useState } from "react";
import type { IsoDate } from "../../../../shared/dates";
import { endClockTime, type ClockTime } from "../../../../shared/sessionTime";
import { timeRange, type WallClockTime } from "../../../lib/timeAndPlace";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconChevron, IconClock, IconStar } from "../../../ui/icons";
import { focusRing, hoverRow, pressable } from "../../../ui/interactive";
import { longDayLabel, nightLabel, relativeDay } from "../calendar/calendarDates";
import type { CalendarSession } from "../calendar/DayCell";
import { EmptyLine, RailCard } from "./RailCard";

export type SessionsTimeAndPlace = WallClockTime & { location?: string; saved: boolean };

export function Sessions({
  sessions,
  today,
  timeAndPlace,
  onSelectDay,
  onOpenTimeAndPlace,
}: {
  sessions: readonly CalendarSession[];
  today: IsoDate;
  timeAndPlace: SessionsTimeAndPlace;
  onSelectDay: (date: IsoDate) => void;
  onOpenTimeAndPlace: () => void;
}) {
  const byDate = sessions
    .filter((session) => session.state === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = byDate.filter((session) => session.date >= today);
  const played = byDate.filter((session) => session.date < today).reverse();
  const next = upcoming[0];
  return (
    <RailCard title="Sessions" status={next && `Next ${relativeDay(next.date, today)}`}>
      {timeAndPlace.saved ? (
        <UsualNight timeAndPlace={timeAndPlace} onEdit={onOpenTimeAndPlace} />
      ) : (
        <TimeAndPlacePrompt timeAndPlace={timeAndPlace} onSet={onOpenTimeAndPlace} />
      )}
      {upcoming.length === 0 ? (
        <EmptyLine>Nothing scheduled. Pick a night from the calendar or the best nights.</EmptyLine>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {upcoming.map((session) => (
            <li key={session._id}>
              <button
                type="button"
                onClick={() => onSelectDay(session.date)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border border-accent/40 bg-accent-soft/50 px-3 py-2.5 text-left hover:border-accent hover:bg-accent-soft",
                  pressable,
                )}
              >
                <IconStar className="size-5 shrink-0 text-accent-strong" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{longDayLabel(session.date)}</span>
                  <span className="block text-xs text-ink-3">
                    {`${relativeDay(session.date, today)} · `}
                    <span className="font-mono">
                      {timeRange({ ...session, timeZone: timeAndPlace.timeZone })}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {played.length > 0 && <PlayedSessions sessions={played} />}
    </RailCard>
  );
}

function TimeAndPlacePrompt({
  timeAndPlace,
  onSet,
}: {
  timeAndPlace: WallClockTime;
  onSet: () => void;
}) {
  const end = endClockTime(timeAndPlace.startTime as ClockTime, timeAndPlace.lengthMinutes);
  return (
    <div className="mt-3 rounded-md border border-dashed border-line-strong px-3 py-2.5">
      <p className="text-sm font-semibold">When and where do you play?</p>
      <p className="mt-0.5 text-xs text-ink-3">
        {`Calendars show ${timeAndPlace.startTime} to ${end} until you change it.`}
      </p>
      <Button size="sm" variant="soft" className="mt-2" onClick={onSet}>
        Set time and place
      </Button>
    </div>
  );
}

function UsualNight({
  timeAndPlace,
  onEdit,
}: {
  timeAndPlace: SessionsTimeAndPlace;
  onEdit: () => void;
}) {
  const range = timeRange(timeAndPlace);
  const summary = timeAndPlace.location ? `${range} · ${timeAndPlace.location}` : range;
  return (
    <button
      type="button"
      aria-label={`Edit time and place, ${summary}`}
      onClick={onEdit}
      className={cn(
        "-mx-2 mt-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-2",
        hoverRow,
      )}
    >
      <IconClock className="size-4 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono text-[13px] text-ink">{range}</span>
        {timeAndPlace.location && ` · ${timeAndPlace.location}`}
      </span>
      <span className="text-xs font-semibold text-accent-strong">Edit</span>
    </button>
  );
}

function PlayedSessions({ sessions }: { sessions: readonly CalendarSession[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((shown) => !shown)}
        className={cn(
          "-ml-1 flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium text-ink-3 transition-colors hover:text-ink",
          focusRing,
        )}
      >
        <IconChevron direction={open ? "up" : "down"} className="size-3.5" />
        {`${String(sessions.length)} played`}
      </button>
      {open && (
        <ul id={listId} className="mt-2 flex flex-col gap-1 px-1 text-sm text-ink-2">
          {sessions.map((session) => (
            <li key={session._id}>{nightLabel(session.date)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
