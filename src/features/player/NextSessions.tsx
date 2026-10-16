import { useId } from "react";
import type { IsoDate } from "../../../shared/dates";
import { timeRange } from "../../lib/timeAndPlace";
import { IconStar } from "../../ui/icons";
import { longDayLabel, relativeDay } from "../group/calendar/calendarDates";
import type { PlayerSession } from "./playerMonth";

export function NextSessions({
  sessions,
  timeZone,
  today,
}: {
  sessions: readonly PlayerSession[];
  timeZone: string;
  today: IsoDate;
}) {
  const headingId = useId();
  const upcoming = sessions
    .filter((session) => session.state === "scheduled" && session.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface p-3.5 shadow-card"
    >
      <h2
        id={headingId}
        className="font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase"
      >
        Next sessions
      </h2>
      <ul className="mt-2.5 flex flex-col gap-2">
        {upcoming.map((session) => (
          <li
            key={session.date}
            className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent-soft/50 px-3 py-2.5"
          >
            <IconStar className="mt-0.5 size-5 shrink-0 text-accent-strong" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{longDayLabel(session.date)}</span>
              <span className="block text-xs text-ink-3">
                {`${relativeDay(session.date, today)} · `}
                <span className="font-mono">{timeRange({ ...session, timeZone })}</span>
              </span>
              {session.location && (
                <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-2">
                  {session.location}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
