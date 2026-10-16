import { v, type Infer } from "convex/values";
import { bookingWindow, todayUtc, type IsoDate } from "../shared/dates";
import { sessionWindow } from "../shared/sessionTime";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { publishedSession, sessionState } from "./schema";
import { sessionPublished } from "./sessionMail";
import { fail } from "./model/errors";
import { groupTimeOf, locationOf } from "./model/timeAndPlace";

const UNDO_WINDOW_MS = 30_000;
const SNAPSHOT_FIELDS = ["state", "start", "end", "location", "summary"] as const;

type SessionState = Infer<typeof sessionState>;
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

export function snapshotOf(
  group: Doc<"groups">,
  session: Doc<"sessions">,
  state: SessionState,
): SessionSnapshot {
  return {
    state,
    ...sessionWindow(session.date, groupTimeOf(group)),
    ...locationOf(group),
    summary: group.name,
  };
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
    const previous = session.published;
    if (previous !== undefined && isPublishedAs(previous, snapshot)) return null;
    const published = { ...snapshot, revision: (previous?.revision ?? 0) + 1 };
    await ctx.db.patch("sessions", sessionId, { published });
    await sessionPublished(ctx, { ...session, published }, previous);
    return null;
  },
});

function isPublishedAs(published: PublishedSession, snapshot: SessionSnapshot) {
  return SNAPSHOT_FIELDS.every((field) => published[field] === snapshot[field]);
}

export function stateOf(session: Doc<"sessions">): SessionState {
  return session.state ?? "scheduled";
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
  change: { state?: SessionState } = {},
) {
  const changedAt = Date.now();
  await ctx.db.patch("sessions", sessionId, { ...change, changedAt });
  await ctx.scheduler.runAfter(UNDO_WINDOW_MS + 1, internal.sessionLifecycle.settle, {
    sessionId,
    changedAt,
  });
}
