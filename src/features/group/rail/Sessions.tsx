import { useId, useState } from "react";
import type { IsoDate } from "../../../../shared/dates";
import { cn } from "../../../ui/cn";
import { IconChevron, IconStar } from "../../../ui/icons";
import { focusRing, pressable } from "../../../ui/interactive";
import { longDayLabel, nightLabel, relativeDay } from "../calendar/calendarDates";
import type { CalendarSession } from "../calendar/DayCell";
import { EmptyLine, RailCard } from "./RailCard";

export function Sessions({
  sessions,
  today,
  onSelectDay,
}: {
  sessions: readonly CalendarSession[];
  today: IsoDate;
  onSelectDay: (date: IsoDate) => void;
}) {
  const byDate = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = byDate.filter((session) => session.date >= today);
  const played = byDate.filter((session) => session.date < today).reverse();
  const next = upcoming[0];
  return (
    <RailCard title="Sessions" status={next && `Next ${relativeDay(next.date, today)}`}>
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
                    {relativeDay(session.date, today)}
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
