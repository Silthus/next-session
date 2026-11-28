import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { ownedGroup, ownedPlayer, touchGroup } from "./model/access";
import { ensureNameIsFree, ensureRosterHasRoom, releaseForGm, validName } from "./model/players";
import { fail } from "./model/errors";
import { enforceRateLimit } from "./model/rateLimits";
import { changeRecipientSet } from "./sessionMail";

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
    const { userId } = player;
    if (userId === undefined) await deletePlayer(ctx, player);
    else
      await changeRecipientSet(ctx, { groupId: group._id, userId }, () =>
        deletePlayer(ctx, player),
      );
    await touchGroup(ctx, group);
    return null;
  },
});

export const releasePlayer = mutation({
  args: { playerId: v.id("players"), claimedAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { playerId, claimedAt }) => {
    const { gm, group, player } = await ownedPlayer(ctx, playerId);
    if (player.userId === undefined) return null;
    if (player.claimedAt !== claimedAt) fail({ code: "PLAYER_CLAIMED" });
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await releaseForGm(ctx, player, player.userId);
    await touchGroup(ctx, group);
    return null;
  },
});

async function deletePlayer(ctx: MutationCtx, player: Doc<"players">) {
  await deleteAnswersOf(ctx, player._id);
  await deleteUnlocksOf(ctx, player._id);
  await ctx.db.delete("players", player._id);
}

async function deleteUnlocksOf(ctx: MutationCtx, playerId: Id<"players">) {
  const unlocks = await ctx.db
    .query("groupRemovals")
    .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
    .collect();
  for (const unlock of unlocks) await ctx.db.delete("groupRemovals", unlock._id);
}

async function deleteAnswersOf(ctx: MutationCtx, playerId: Id<"players">) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_playerId_and_date", (q) => q.eq("playerId", playerId))
    .collect();
  for (const answer of answers) await ctx.db.delete("answers", answer._id);
}
