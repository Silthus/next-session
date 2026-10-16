import { Link } from "@tanstack/react-router";
import { useId } from "react";
import type { IsoDate } from "../../../shared/dates";
import { track } from "../../lib/telemetry";
import { timeRange } from "../../lib/timeAndPlace";
import { buttonClassName } from "../../ui/Button";
import { YOUR_CALENDAR } from "../me/YourCalendar";
import { IconStar } from "../../ui/icons";
import { focusRing } from "../../ui/interactive";
import { longDayLabel, relativeDay } from "../group/calendar/calendarDates";
import type { PlayerSession } from "./playerMonth";

export function NextSessions({
  groupId,
  shareToken,
  keptInMyGroups,
  inviteSent,
  sessions,
  timeZone,
  today,
}: {
  groupId: string;
  shareToken: string;
  keptInMyGroups: boolean;
  inviteSent: boolean;
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
      {inviteSent ? (
        <InviteSent />
      ) : (
        <CalendarDownload
          groupId={groupId}
          shareToken={shareToken}
          keptInMyGroups={keptInMyGroups}
        />
      )}
    </section>
  );
}

function InviteSent() {
  return (
    <p className="mt-3 flex">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-free-soft px-3 py-1.5 text-xs font-semibold text-ink-2">
        <span aria-hidden="true" className="text-free">
          ✓
        </span>
        Invite sent
      </span>
    </p>
  );
}

function CalendarDownload({
  groupId,
  shareToken,
  keptInMyGroups,
}: {
  groupId: string;
  shareToken: string;
  keptInMyGroups: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <a
        href={`/cal/s/${shareToken}.ics`}
        onClick={() => track({ name: "calendar_downloaded", group_id: groupId })}
        className={buttonClassName("secondary", "md")}
      >
        Add to calendar
      </a>
      <p className="min-w-0 flex-1 basis-48 text-xs text-ink-3">
        A one-time copy.{" "}
        {keptInMyGroups ? (
          <>
            <Link
              to="/me"
              hash={YOUR_CALENDAR}
              className={`-my-3.5 rounded-sm py-3.5 font-semibold text-accent-strong underline underline-offset-2 hover:text-ink ${focusRing}`}
            >
              Subscribe on My groups
            </Link>{" "}
            to follow moves and cancellations.
          </>
        ) : (
          "Keep this group to get moves and cancellations too."
        )}
      </p>
    </div>
  );
}
