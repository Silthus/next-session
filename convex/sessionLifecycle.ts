import { v, type Infer } from "convex/values";
import type { IsoDate } from "../shared/dates";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { sessionState } from "./schema";
import { sessionPublished } from "./sessionMail";
import { fail } from "./model/errors";

const UNDO_WINDOW_MS = 30_000;

type SessionState = Infer<typeof sessionState>;

export function isScheduled(session: Doc<"sessions">) {
  return stateOf(session) === "scheduled";
}

export async function scheduleSession(ctx: MutationCtx, group: Doc<"groups">, date: IsoDate) {
  const existing = await sessionOn(ctx, group._id, date);
  if (existing !== null && isScheduled(existing)) fail({ code: "SESSION_EXISTS" });
  const sessionId =
    existing?._id ?? (await ctx.db.insert("sessions", { groupId: group._id, date }));
  await recordChange(ctx, sessionId, "scheduled");
  return sessionId;
}

export async function cancelSession(ctx: MutationCtx, session: Doc<"sessions">) {
  if (session.published === undefined) await ctx.db.delete("sessions", session._id);
  else await recordChange(ctx, session._id, "cancelled");
}

export const settle = internalMutation({
  args: { sessionId: v.id("sessions"), changedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { sessionId, changedAt }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (session === null || session.changedAt !== changedAt) return null;
    const state = stateOf(session);
    if (session.published?.state === state) return null;
    const published = { state, revision: (session.published?.revision ?? 0) + 1 };
    await ctx.db.patch("sessions", sessionId, { published });
    await sessionPublished(ctx, { ...session, published });
    return null;
  },
});

export function stateOf(session: Doc<"sessions">): SessionState {
  return session.state ?? "scheduled";
}

async function sessionOn(ctx: QueryCtx, groupId: Id<"groups">, date: IsoDate) {
  return await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId).eq("date", date))
    .unique();
}

async function recordChange(ctx: MutationCtx, sessionId: Id<"sessions">, state: SessionState) {
  const changedAt = Date.now();
  await ctx.db.patch("sessions", sessionId, { state, changedAt });
  await ctx.scheduler.runAfter(UNDO_WINDOW_MS + 1, internal.sessionLifecycle.settle, {
    sessionId,
    changedAt,
  });
}
