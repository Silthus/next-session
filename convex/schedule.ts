import { v } from "convex/values";
import { addMonths, isValidMonth, type IsoMonth } from "../shared/dates";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { findOwnedGroup } from "./model/access";
import { answerValue } from "./schema";

const monthSchedule = v.object({
  players: v.array(v.object({ _id: v.id("players"), name: v.string() })),
  answers: v.array(v.object({ playerId: v.id("players"), date: v.string(), answer: answerValue })),
  sessions: v.array(v.object({ _id: v.id("sessions"), date: v.string() })),
});

export const month = query({
  args: { groupId: v.string(), month: v.string() },
  returns: v.union(monthSchedule, v.null()),
  handler: async (ctx, { groupId, month }) => {
    const group = await findOwnedGroup(ctx, groupId);
    if (group === null || !isValidMonth(month)) return null;
    const [players, answers, sessions] = await Promise.all([
      rosterOf(ctx, group._id),
      answersIn(ctx, group._id, month),
      sessionsOf(ctx, group._id),
    ]);
    return { players, answers, sessions };
  },
});

async function rosterOf(ctx: QueryCtx, groupId: Id<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .collect();
  return players.map(({ _id, name }) => ({ _id, name }));
}

async function answersIn(ctx: QueryCtx, groupId: Id<"groups">, month: IsoMonth) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_groupId_and_date", (q) =>
      q
        .eq("groupId", groupId)
        .gte("date", firstDayOf(month))
        .lt("date", firstDayOf(addMonths(month, 1))),
    )
    .collect();
  return answers.map(({ playerId, date, answer }) => ({ playerId, date, answer }));
}

async function sessionsOf(ctx: QueryCtx, groupId: Id<"groups">) {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
    .collect();
  return sessions.map(({ _id, date }) => ({ _id, date }));
}

function firstDayOf(month: IsoMonth) {
  return `${month}-01`;
}
