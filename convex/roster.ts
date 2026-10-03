import { v } from "convex/values";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import { normalizeName, type NormalizedName } from "../shared/names";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ownedGroup, ownedPlayer, touchGroup } from "./model/access";
import { fail } from "./model/errors";

export const addPlayer = mutation({
  args: { groupId: v.id("groups"), name: v.string() },
  returns: v.id("players"),
  handler: async (ctx, { groupId, name }) => {
    const { group } = await ownedGroup(ctx, groupId);
    const normalized = validName(name);
    await ensureNameIsFree(ctx, group._id, normalized);
    await ensureRosterHasRoom(ctx, group._id);
    const playerId = await ctx.db.insert("players", { groupId: group._id, ...normalized });
    await touchGroup(ctx, group);
    return playerId;
  },
});

export const renamePlayer = mutation({
  args: { playerId: v.id("players"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId, name }) => {
    const { group, player } = await ownedPlayer(ctx, playerId);
    const normalized = validName(name);
    await ensureNameIsFree(ctx, group._id, normalized, player._id);
    await ctx.db.patch("players", player._id, normalized);
    await touchGroup(ctx, group);
    return null;
  },
});

export const removePlayer = mutation({
  args: { playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const { group, player } = await ownedPlayer(ctx, playerId);
    await deleteAnswersOf(ctx, player._id);
    await ctx.db.delete("players", player._id);
    await touchGroup(ctx, group);
    return null;
  },
});

function validName(raw: string): NormalizedName {
  const normalized = normalizeName(raw);
  return normalized === "INVALID_NAME" ? fail({ code: "INVALID_NAME" }) : normalized;
}

async function ensureNameIsFree(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  { nameKey }: NormalizedName,
  renamedPlayerId?: Id<"players">,
) {
  const holder = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId).eq("nameKey", nameKey))
    .first();
  if (holder !== null && holder._id !== renamedPlayerId) {
    fail({ code: "NAME_TAKEN", playerId: holder._id });
  }
}

async function ensureRosterHasRoom(ctx: QueryCtx, groupId: Id<"groups">) {
  const roster = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  if (roster.length >= MAX_PLAYERS_PER_GROUP) fail({ code: "ROSTER_FULL" });
}

async function deleteAnswersOf(ctx: MutationCtx, playerId: Id<"players">) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_playerId_and_date", (q) => q.eq("playerId", playerId))
    .collect();
  for (const answer of answers) await ctx.db.delete("answers", answer._id);
}
