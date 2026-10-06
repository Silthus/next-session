import { MAX_CLAIMED_PLAYERS_PER_ACCOUNT, MAX_PLAYERS_PER_GROUP } from "../../shared/limits";
import { normalizeName, type NormalizedName } from "../../shared/names";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export function validName(raw: string): NormalizedName {
  const normalized = normalizeName(raw);
  return normalized === "INVALID_NAME" ? fail({ code: "INVALID_NAME" }) : normalized;
}

export async function ensureNameIsFree(
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

export async function ensureRosterHasRoom(ctx: QueryCtx, groupId: Id<"groups">) {
  const roster = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  if (roster.length >= MAX_PLAYERS_PER_GROUP) fail({ code: "ROSTER_FULL" });
}

export async function claimedPlayerIn(
  ctx: QueryCtx,
  accountId: Id<"users">,
  groupId: Id<"groups">,
) {
  return await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", accountId).eq("groupId", groupId))
    .first();
}

export async function claimPlayer(ctx: MutationCtx, account: Doc<"users">, player: Doc<"players">) {
  if (player.userId === account._id) return;
  if (player.userId !== undefined) fail({ code: "PLAYER_CLAIMED" });
  const earlier = await claimedPlayerIn(ctx, account._id, player.groupId);
  if (earlier === null) await ensureRoomForAnotherClaim(ctx, account._id);
  else await ctx.db.patch("players", earlier._id, { userId: undefined });
  await ctx.db.patch("players", player._id, { userId: account._id });
}

async function ensureRoomForAnotherClaim(ctx: QueryCtx, accountId: Id<"users">) {
  const claimed = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", accountId))
    .take(MAX_CLAIMED_PLAYERS_PER_ACCOUNT);
  if (claimed.length >= MAX_CLAIMED_PLAYERS_PER_ACCOUNT) fail({ code: "TOO_MANY_GROUPS" });
}
