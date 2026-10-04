import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { IsoDate } from "../../../../shared/dates";
import type { ShowToast } from "../useToast";
import { dayLabel } from "./calendarDates";
import { focusDay } from "./dayFocus";
import type { CalendarSession } from "./DayCell";
import { errorMessage } from "../../../lib/errors";

export function useSessionActions(groupId: Id<"groups">, show: ShowToast) {
  const inFlight = useRef(new Set<IsoDate>());
  const [pendingDates, setPendingDates] = useState<ReadonlySet<IsoDate>>(new Set());
  const scheduleSession = useMutation(api.sessions.schedule).withOptimisticUpdate(
    (store, { date }) =>
      editCachedSessions(store, groupId, (sessions) => [
        ...sessions,
        { _id: `optimistic-${date}` as Id<"sessions">, date },
      ]),
  );
  const unscheduleSession = useMutation(api.sessions.unschedule).withOptimisticUpdate(
    (store, { sessionId }) =>
      editCachedSessions(store, groupId, (sessions) =>
        sessions.filter((session) => session._id !== sessionId),
      ),
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
        void unschedule({ _id: sessionId, date });
        focusDay(date);
      });
    });
  }

  function unschedule(session: CalendarSession) {
    return settle(session.date, async () => {
      await unscheduleSession({ sessionId: session._id });
      show(`Session on ${dayLabel(session.date)} removed.`, () => {
        void schedule(session.date);
        focusDay(session.date);
      });
    });
  }

  return {
    schedule,
    unschedule,
    isPending: (date: IsoDate) => pendingDates.has(date),
  };
}

function editCachedSessions(
  store: OptimisticLocalStore,
  groupId: Id<"groups">,
  edit: (sessions: CalendarSession[]) => CalendarSession[],
) {
  for (const { args, value } of store.getAllQueries(api.schedule.month)) {
    if (args.groupId !== groupId || !value) continue;
    store.setQuery(api.schedule.month, args, { ...value, sessions: edit(value.sessions) });
  }
}
