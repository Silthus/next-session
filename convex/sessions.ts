import { v } from "convex/values";
import { isBookable, todayUtc } from "../shared/dates";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx } from "./_generated/server";
import { ownedGroup, ownedSession, touchGroup } from "./model/access";
import { fail } from "./model/errors";
import { enforceRateLimit } from "./model/rateLimits";
import { track, type ServerEvent } from "./model/telemetry";

export const schedule = mutation({
  args: { groupId: v.id("groups"), date: v.string() },
  returns: v.id("sessions"),
  handler: async (ctx, { groupId, date }) => {
    const { gm, group } = await ownedGroup(ctx, groupId);
    ensureBookable(date);
    if ((await sessionOn(ctx, group._id, date)) !== null) fail({ code: "SESSION_EXISTS" });
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    const sessionId = await ctx.db.insert("sessions", { groupId: group._id, date });
    await touchGroup(ctx, group);
    await track(ctx, () => sessionScheduled(ctx, gm, group._id));
    return sessionId;
  },
});

export const unschedule = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const { gm, group, session } = await ownedSession(ctx, sessionId);
    ensureBookable(session.date);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await ctx.db.delete("sessions", session._id);
    await touchGroup(ctx, group);
    await track(ctx, { name: "session_unscheduled", actor: gm, group_id: group._id });
    return null;
  },
});

function ensureBookable(date: string) {
  if (!isBookable(date, todayUtc(Date.now()))) fail({ code: "OUT_OF_WINDOW" });
}

async function sessionOn(ctx: QueryCtx, groupId: Id<"groups">, date: string) {
  return await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId).eq("date", date))
    .first();
}

async function sessionScheduled(
  ctx: QueryCtx,
  gm: Doc<"users">,
  groupId: Id<"groups">,
): Promise<ServerEvent> {
  const [players, sessions] = await Promise.all([
    ctx.db
      .query("players")
      .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
      .take(MAX_PLAYERS_PER_GROUP),
    ctx.db
      .query("sessions")
      .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
      .take(2),
  ]);
  return {
    name: "session_scheduled",
    actor: gm,
    group_id: groupId,
    player_count: players.length,
    is_first_for_group: sessions.length === 1,
  };
}
