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
  else await unclaim(ctx, earlier);
  await ctx.db.patch("players", player._id, { userId: account._id });
  await forgetRemovalFromMyGroups(ctx, account._id, player.groupId);
}

export async function keepOnAnswer(
  ctx: MutationCtx,
  account: Doc<"users">,
  group: Doc<"groups">,
  player: Doc<"players">,
) {
  if (!(await answerKeeps(ctx, account, group, player))) return false;
  await claimPlayer(ctx, account, player);
  return true;
}

export async function releaseClaim(ctx: MutationCtx, account: Doc<"users">, groupId: Id<"groups">) {
  const claimed = await claimedPlayerIn(ctx, account._id, groupId);
  if (claimed !== null) await unclaim(ctx, claimed);
  return claimed;
}

export async function removeFromMyGroups(
  ctx: MutationCtx,
  account: Doc<"users">,
  groupId: Id<"groups">,
) {
  const released = await releaseClaim(ctx, account, groupId);
  if (released !== null) {
    if ((await removalFromMyGroups(ctx, account._id, groupId)) === null) {
      await ctx.db.insert("groupRemovals", { userId: account._id, groupId });
    }
  }
  return released;
}

async function answerKeeps(
  ctx: QueryCtx,
  account: Doc<"users">,
  group: Doc<"groups">,
  player: Doc<"players">,
) {
  if (player.userId !== undefined) return false;
  if ((await removalFromMyGroups(ctx, account._id, group._id)) !== null) return false;
  return (
    (await claimedPlayerIn(ctx, account._id, group._id)) !== null ||
    !(await atClaimCap(ctx, account._id))
  );
}

async function forgetRemovalFromMyGroups(
  ctx: MutationCtx,
  accountId: Id<"users">,
  groupId: Id<"groups">,
) {
  const removed = await removalFromMyGroups(ctx, accountId, groupId);
  if (removed !== null) await ctx.db.delete("groupRemovals", removed._id);
}

async function removalFromMyGroups(ctx: QueryCtx, accountId: Id<"users">, groupId: Id<"groups">) {
  return await ctx.db
    .query("groupRemovals")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", accountId).eq("groupId", groupId))
    .unique();
}

async function unclaim(ctx: MutationCtx, player: Doc<"players">) {
  await ctx.db.patch("players", player._id, { userId: undefined });
}

async function ensureRoomForAnotherClaim(ctx: QueryCtx, accountId: Id<"users">) {
  if (await atClaimCap(ctx, accountId)) fail({ code: "TOO_MANY_GROUPS" });
}

async function atClaimCap(ctx: QueryCtx, accountId: Id<"users">) {
  const claimed = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", accountId))
    .take(MAX_CLAIMED_PLAYERS_PER_ACCOUNT);
  return claimed.length >= MAX_CLAIMED_PLAYERS_PER_ACCOUNT;
}
