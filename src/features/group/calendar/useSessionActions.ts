import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { IsoDate } from "../../../../shared/dates";
import type { ShowToast } from "../useToast";
import { dayLabel } from "./calendarDates";
import { focusDay } from "./dayFocus";
import type { CalendarSession } from "./DayCell";
import type { SessionDetailChanges } from "./SessionDetails";
import { errorMessage } from "../../../lib/errors";

export function useSessionActions(groupId: Id<"groups">, show: ShowToast) {
  const inFlight = useRef(new Set<IsoDate>());
  const [pendingDates, setPendingDates] = useState<ReadonlySet<IsoDate>>(new Set());
  const scheduleSession = useMutation(api.sessions.schedule).withOptimisticUpdate(
    (store, { date }) =>
      editCachedSessions(store, groupId, ({ sessions, timeAndPlace }) =>
        scheduled(sessions, date, timeAndPlace),
      ),
  );
  const updateSessionDetails = useMutation(api.sessions.updateDetails);
  const cancelSession = useMutation(api.sessions.cancel).withOptimisticUpdate(
    (store, { sessionId }) =>
      editCachedSessions(store, groupId, ({ sessions }) => cancelled(sessions, sessionId)),
  );

  async function settle(date: IsoDate, change: () => Promise<void>) {
    if (inFlight.current.has(date)) return;
    inFlight.current.add(date);
    setPendingDates(new Set(inFlight.current));
    try {
      await change();
    } catch (error) {
      show(errorMessage(error, "session"));
    } finally {
      inFlight.current.delete(date);
      setPendingDates(new Set(inFlight.current));
    }
  }

  function schedule(date: IsoDate) {
    return settle(date, async () => {
      const sessionId = await scheduleSession({ groupId, date });
      show(`Session on ${dayLabel(date)}. Players see it on the link.`, () => {
        void cancel({ _id: sessionId, date });
        focusDay(date);
      });
    });
  }

  function cancel(session: Pick<CalendarSession, "_id" | "date">) {
    return settle(session.date, async () => {
      await cancelSession({ sessionId: session._id });
      show(`Session on ${dayLabel(session.date)} cancelled.`, () => {
        void schedule(session.date);
        focusDay(session.date);
      });
    });
  }

  async function updateDetails(
    session: Pick<CalendarSession, "_id">,
    changes: SessionDetailChanges,
  ) {
    await updateSessionDetails({ sessionId: session._id, ...changes });
  }

  return {
    schedule,
    cancel,
    updateDetails,
    isPending: (date: IsoDate) => pendingDates.has(date),
  };
}

type MonthSchedule = NonNullable<FunctionReturnType<typeof api.schedule.month>>;

function optimisticSession(
  date: IsoDate,
  { startTime, lengthMinutes, location }: MonthSchedule["timeAndPlace"],
): CalendarSession {
  return {
    _id: `optimistic-${date}` as Id<"sessions">,
    date,
    state: "scheduled",
    published: false,
    startTime,
    lengthMinutes,
    location,
    overrides: [],
  };
}

function editCachedSessions(
  store: OptimisticLocalStore,
  groupId: Id<"groups">,
  edit: (month: MonthSchedule) => MonthSchedule["sessions"],
) {
  for (const { args, value } of store.getAllQueries(api.schedule.month)) {
    if (args.groupId !== groupId || !value) continue;
    store.setQuery(api.schedule.month, args, { ...value, sessions: edit(value) });
  }
}

function scheduled(
  sessions: CalendarSession[],
  date: IsoDate,
  timeAndPlace: MonthSchedule["timeAndPlace"],
): CalendarSession[] {
  if (!sessions.some((session) => session.date === date)) {
    return [...sessions, optimisticSession(date, timeAndPlace)];
  }
  return sessions.map((session) =>
    session.date === date ? { ...session, state: "scheduled" } : session,
  );
}

function cancelled(sessions: CalendarSession[], sessionId: Id<"sessions">): CalendarSession[] {
  return sessions.flatMap((session) => {
    if (session._id !== sessionId) return [session];
    return session.published ? [{ ...session, state: "cancelled" }] : [];
  });
}
