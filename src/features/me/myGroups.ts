import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { IsoDate } from "../../../shared/dates";

export type MyGroups = NonNullable<FunctionReturnType<typeof api.me.groups>>;
export type PlayingGroup = MyGroups["playing"][number];
export type RunningGroup = MyGroups["running"][number];

export type GroupPage =
  { kind: "gm"; groupId: Id<"groups"> } | { kind: "player"; shareToken: string };

export type UpcomingSession = { date: IsoDate; groupName: string; to: GroupPage };

const NEXT_SESSIONS_SHOWN = 5;

export function nextSessions(groups: MyGroups): UpcomingSession[] {
  const run = new Set(groups.running.map(({ groupId }) => groupId));
  const sessions = [
    ...groups.running.flatMap((group) => sessionsOf(group, { kind: "gm", groupId: group.groupId })),
    ...groups.playing
      .filter(({ groupId }) => !run.has(groupId))
      .flatMap((group) => sessionsOf(group, { kind: "player", shareToken: group.shareToken })),
  ];
  return sessions.sort(byDateThenGroupName).slice(0, NEXT_SESSIONS_SHOWN);
}

export function daysToAnswer(openDates: number): string | null {
  if (openDates <= 0) return null;
  return `${String(openDates)} ${openDates === 1 ? "day" : "days"} to answer`;
}

function sessionsOf(
  group: { name: string; upcomingSessions: IsoDate[] },
  to: GroupPage,
): UpcomingSession[] {
  return group.upcomingSessions.map((date) => ({ date, groupName: group.name, to }));
}

function byDateThenGroupName(a: UpcomingSession, b: UpcomingSession) {
  return a.date.localeCompare(b.date) || a.groupName.localeCompare(b.groupName);
}
