import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { ownedGroup, ownedPlayer, touchGroup } from "./model/access";
import { ensureNameIsFree, ensureRosterHasRoom, validName } from "./model/players";
import { enforceRateLimit } from "./model/rateLimits";

export const addPlayer = mutation({
  args: { groupId: v.id("groups"), name: v.string() },
  returns: v.id("players"),
  handler: async (ctx, { groupId, name }) => {
    const { gm, group } = await ownedGroup(ctx, groupId);
    const normalized = validName(name);
    await ensureNameIsFree(ctx, group._id, normalized);
    await ensureRosterHasRoom(ctx, group._id);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    const playerId = await ctx.db.insert("players", { groupId: group._id, ...normalized });
    await touchGroup(ctx, group);
    return playerId;
  },
});

export const renamePlayer = mutation({
  args: { playerId: v.id("players"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId, name }) => {
    const { gm, group, player } = await ownedPlayer(ctx, playerId);
    const normalized = validName(name);
    await ensureNameIsFree(ctx, group._id, normalized, player._id);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await ctx.db.patch("players", player._id, normalized);
    await touchGroup(ctx, group);
    return null;
  },
});

export const removePlayer = mutation({
  args: { playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const { gm, group, player } = await ownedPlayer(ctx, playerId);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await deleteAnswersOf(ctx, player._id);
    await ctx.db.delete("players", player._id);
    await touchGroup(ctx, group);
    return null;
  },
});

async function deleteAnswersOf(ctx: MutationCtx, playerId: Id<"players">) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_playerId_and_date", (q) => q.eq("playerId", playerId))
    .collect();
  for (const answer of answers) await ctx.db.delete("answers", answer._id);
}
