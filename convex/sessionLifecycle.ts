import { v, type Infer } from "convex/values";
import { bookingWindow, todayUtc, type IsoDate } from "../shared/dates";
import { DEFAULT_GROUP_TIME, sessionWindow } from "../shared/sessionTime";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { UNDO_WINDOW_MS, type SessionState } from "../shared/sessions";
import type { publishedSession } from "./schema";
import * as reminders from "./reminders";
import * as sessionMail from "./sessionMail";
import { fail } from "./model/errors";
import {
  groupTimeOf,
  sessionLocationOf,
  sessionOverridesOf,
  type SessionDetailChanges,
} from "./model/timeAndPlace";

const SNAPSHOT_FIELDS = ["state", "start", "end", "location", "summary"] as const;

type PublishedSession = Infer<typeof publishedSession>;
export type SessionSnapshot = Omit<PublishedSession, "revision">;

export function isScheduled(session: Doc<"sessions">) {
  return stateOf(session) === "scheduled";
}

export async function scheduleSession(ctx: MutationCtx, group: Doc<"groups">, date: IsoDate) {
  const existing = await sessionOn(ctx, group._id, date);
  if (existing !== null && isScheduled(existing)) fail({ code: "SESSION_EXISTS" });
  const sessionId =
    existing?._id ?? (await ctx.db.insert("sessions", { groupId: group._id, date }));
  await recordChange(ctx, sessionId, { state: "scheduled" });
  return sessionId;
}

export async function cancelSession(ctx: MutationCtx, session: Doc<"sessions">) {
  if (session.published === undefined) await ctx.db.delete("sessions", session._id);
  else await recordChange(ctx, session._id, { state: "cancelled" });
}

export async function groupChanged(ctx: MutationCtx, group: Doc<"groups">) {
  const { first, last } = bookingWindow(todayUtc(Date.now()));
  const upcoming = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) =>
      q.eq("groupId", group._id).gte("date", first).lte("date", last),
    )
    .collect();
  for (const session of upcoming.filter(isScheduled)) await recordChange(ctx, session._id);
}

export async function updateSessionDetails(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  changes: SessionDetailChanges,
) {
  await recordChange(ctx, session._id, changes);
}

function snapshotOf(
  group: Doc<"groups">,
  session: Doc<"sessions">,
  state: SessionState,
): SessionSnapshot {
  return {
    state,
    ...sessionWindow(session.date, groupTimeOf(group), sessionOverridesOf(session)),
    ...sessionLocationOf(group, session),
    summary: group.name,
  };
}

export function widenedSnapshot(
  group: Doc<"groups">,
  session: Doc<"sessions">,
  published: PublishedSession,
): PublishedSession {
  return { ...snapshotBeforeTimeAndPlace(group, session, published.state), ...published };
}

function snapshotBeforeTimeAndPlace(
  group: Doc<"groups">,
  session: Doc<"sessions">,
  state: SessionState,
): SessionSnapshot {
  return { state, ...sessionWindow(session.date, DEFAULT_GROUP_TIME), summary: group.name };
}

export const settle = internalMutation({
  args: { sessionId: v.id("sessions"), changedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { sessionId, changedAt }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (session === null || session.changedAt !== changedAt) return null;
    const group = await ctx.db.get("groups", session.groupId);
    if (group === null) return null;
    const snapshot = snapshotOf(group, session, stateOf(session));
    const previous = session.published && widenedSnapshot(group, session, session.published);
    if (previous !== undefined && isPublishedAs(previous, snapshot)) return null;
    const published = { ...snapshot, revision: (previous?.revision ?? 0) + 1 };
    await ctx.db.patch("sessions", sessionId, { published });
    const settled = { ...session, published };
    await sessionMail.sessionPublished(ctx, settled, previous);
    await reminders.sessionPublished(ctx, settled, group);
    return null;
  },
});

function isPublishedAs(published: PublishedSession, snapshot: SessionSnapshot) {
  return SNAPSHOT_FIELDS.every((field) => published[field] === snapshot[field]);
}

export function isSettling(session: Doc<"sessions">) {
  return session.changedAt !== undefined && Date.now() - session.changedAt <= UNDO_WINDOW_MS + 1;
}

export function stateOf(session: Doc<"sessions">): SessionState {
  return session.state ?? "scheduled";
}

export function datedSessionOf(session: Doc<"sessions">) {
  return { date: session.date, state: stateOf(session) };
}

async function sessionOn(ctx: QueryCtx, groupId: Id<"groups">, date: IsoDate) {
  return await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId).eq("date", date))
    .unique();
}

async function recordChange(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  change: { state?: SessionState } & SessionDetailChanges = {},
) {
  const changedAt = Date.now();
  await ctx.db.patch("sessions", sessionId, { ...change, changedAt });
  await ctx.scheduler.runAfter(UNDO_WINDOW_MS + 1, internal.sessionLifecycle.settle, {
    sessionId,
    changedAt,
  });
}
