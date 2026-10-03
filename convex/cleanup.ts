import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { deleteGroup } from "./model/groups";

const SWEEP_PAGE_SIZE = 50;

export const sweepExpiredGroups = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("groups")
      .withIndex("by_expiresAt", (q) => q.gte("expiresAt", 0).lt("expiresAt", Date.now()))
      .take(SWEEP_PAGE_SIZE);
    for (const group of expired) await deleteGroup(ctx, group);
    if (expired.length === SWEEP_PAGE_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepExpiredGroups, {});
    }
    return null;
  },
});
