import { bookingWindow, todayUtc } from "../../shared/dates";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function upcomingSessions(ctx: QueryCtx, groupId: Id<"groups">) {
  const { first, last } = bookingWindow(todayUtc(Date.now()));
  return await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) =>
      q.eq("groupId", groupId).gte("date", first).lte("date", last),
    )
    .collect();
}
