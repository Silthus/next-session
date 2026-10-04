import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { IsoDate } from "../../../../shared/dates";
import { dayLabel } from "./calendarDates";
import type { CalendarSession } from "./DayCell";
import { sessionErrorMessage } from "./sessionErrors";

const TOAST_MS = 5000;

export type SessionToast = { id: number; message: string; undo?: () => void };

export function useSessionActions(groupId: Id<"groups">) {
  const [pendingDates, setPendingDates] = useState<ReadonlySet<IsoDate>>(new Set());
  const [toast, setToast] = useState<SessionToast | null>(null);
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

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function settle(date: IsoDate, change: () => Promise<SessionToast>) {
    setPendingDates((dates) => new Set(dates).add(date));
    try {
      setToast(await change());
    } catch (error) {
      setToast({ id: Date.now(), message: sessionErrorMessage(error) });
    } finally {
      setPendingDates((dates) => withoutDate(dates, date));
    }
  }

  function schedule(date: IsoDate) {
    return settle(date, async () => {
      const sessionId = await scheduleSession({ groupId, date });
      return {
        id: Date.now(),
        message: `Session on ${dayLabel(date)}. Players see it on the link.`,
        undo: () => void unschedule({ _id: sessionId, date }),
      };
    });
  }

  function unschedule(session: CalendarSession) {
    return settle(session.date, async () => {
      await unscheduleSession({ sessionId: session._id });
      return {
        id: Date.now(),
        message: `Session on ${dayLabel(session.date)} removed.`,
        undo: () => void schedule(session.date),
      };
    });
  }

  return {
    schedule,
    unschedule,
    isPending: (date: IsoDate) => pendingDates.has(date),
    toast,
    dismissToast: () => setToast(null),
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

function withoutDate(dates: ReadonlySet<IsoDate>, date: IsoDate) {
  const remaining = new Set(dates);
  remaining.delete(date);
  return remaining;
}
