import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { deleteGroup } from "./model/groups";

const SWEEP_PAGE_SIZE = 50;

export const sweepExpiredGroups = internalMutation({
  args: { cursor: v.optional(v.string()), cutoff: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { cursor, cutoff = Date.now() }) => {
    const page = await ctx.db
      .query("groups")
      .withIndex("by_expiresAt", (q) => q.gte("expiresAt", 0).lt("expiresAt", cutoff))
      .paginate({ cursor: cursor ?? null, numItems: SWEEP_PAGE_SIZE });
    for (const group of page.page) {
      await ctx.scheduler.runAfter(0, internal.cleanup.expireGroup, { groupId: group._id });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepExpiredGroups, {
        cursor: page.continueCursor,
        cutoff,
      });
    }
    return null;
  },
});

export const expireGroup = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get("groups", groupId);
    if (group !== null && isExpired(group)) await deleteGroup(ctx, group);
    return null;
  },
});

function isExpired(group: Doc<"groups">) {
  return group.expiresAt !== undefined && group.expiresAt < Date.now();
}
