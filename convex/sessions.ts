import { v } from "convex/values";
import { isBookable, todayUtc } from "../shared/dates";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx } from "./_generated/server";
import { ownedGroup, requireGm, touchGroup } from "./model/access";
import { fail } from "./model/errors";

export const schedule = mutation({
  args: { groupId: v.id("groups"), date: v.string() },
  returns: v.id("sessions"),
  handler: async (ctx, { groupId, date }) => {
    const { group } = await ownedGroup(ctx, groupId);
    ensureBookable(date);
    if ((await sessionOn(ctx, group._id, date)) !== null) fail({ code: "SESSION_EXISTS" });
    const sessionId = await ctx.db.insert("sessions", { groupId: group._id, date });
    await touchGroup(ctx, group);
    return sessionId;
  },
});

export const unschedule = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    await requireGm(ctx);
    const session = (await ctx.db.get("sessions", sessionId)) ?? fail({ code: "NOT_FOUND" });
    const { group } = await ownedGroup(ctx, session.groupId);
    ensureBookable(session.date);
    await ctx.db.delete("sessions", session._id);
    await touchGroup(ctx, group);
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
