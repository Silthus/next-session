import { MAX_GROUPS_PER_GM } from "../../shared/limits";
import { newShareToken, type RandomBytes } from "../../shared/shareToken";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { expiryFromNow, groupByShareToken } from "./access";
import { fail } from "./errors";
import { deleteAnonymousGm } from "./gms";

const DEFAULT_GROUP_NAME = "My group";

const MINT_ATTEMPTS = 5;
const UNDO_ROTATE_WINDOW_MS = 30_000;
const CHILD_DELETE_BATCH_SIZE = 200;

export async function mintShareToken(ctx: QueryCtx, randomBytes?: RandomBytes) {
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt++) {
    const shareToken = newShareToken(randomBytes);
    if ((await groupByShareToken(ctx, shareToken)) === null) return shareToken;
  }
  throw new Error(`No free Share Token after ${MINT_ATTEMPTS} attempts`);
}

export async function insertGroup(ctx: MutationCtx, owner: Doc<"users">) {
  const shareToken = await mintShareToken(ctx);
  return await ctx.db.insert("groups", {
    ownerId: owner._id,
    name: DEFAULT_GROUP_NAME,
    shareToken,
    ...(owner.isAnonymous === true ? { expiresAt: expiryFromNow() } : {}),
  });
}

export async function groupsOwnedBy(ctx: QueryCtx, ownerId: Id<"users">) {
  return await ctx.db
    .query("groups")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .collect();
}

export async function ensureRoomForAnotherGroup(ctx: QueryCtx, gm: Doc<"users">) {
  const owned = await ctx.db
    .query("groups")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", gm._id))
    .take(MAX_GROUPS_PER_GM);
  if (owned.length >= MAX_GROUPS_PER_GM) fail({ code: "TOO_MANY_GROUPS" });
}

export function canUndoRotate(group: Doc<"groups">) {
  return (
    group.previousShareToken !== undefined &&
    group.shareTokenRotatedAt !== undefined &&
    Date.now() - group.shareTokenRotatedAt <= UNDO_ROTATE_WINDOW_MS
  );
}

export async function rotateShareToken(ctx: MutationCtx, group: Doc<"groups">) {
  await ctx.db.patch("groups", group._id, {
    shareToken: await mintShareToken(ctx),
    previousShareToken: group.shareToken,
    shareTokenRotatedAt: Date.now(),
  });
}

export async function undoRotateShareToken(ctx: MutationCtx, group: Doc<"groups">) {
  const previousShareToken = group.previousShareToken;
  if (previousShareToken === undefined || !canUndoRotate(group)) fail({ code: "UNDO_EXPIRED" });
  if ((await groupByShareToken(ctx, previousShareToken)) !== null) fail({ code: "UNDO_EXPIRED" });
  await ctx.db.patch("groups", group._id, {
    shareToken: previousShareToken,
    previousShareToken: undefined,
    shareTokenRotatedAt: undefined,
  });
}

export async function deleteGroup(ctx: MutationCtx, group: Doc<"groups">) {
  await ctx.db.delete("groups", group._id);
  await ctx.scheduler.runAfter(0, internal.groups.deleteChildren, { groupId: group._id });
  await endAnonymousGmWithoutGroups(ctx, group.ownerId);
}

async function endAnonymousGmWithoutGroups(ctx: MutationCtx, ownerId: Id<"users">) {
  const owner = await ctx.db.get("users", ownerId);
  if (owner?.isAnonymous !== true) return;
  const anyGroup = await ctx.db
    .query("groups")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .first();
  if (anyGroup === null) await deleteAnonymousGm(ctx, ownerId);
}

export async function deleteChildBatch(ctx: MutationCtx, groupId: Id<"groups">) {
  return (
    (await deleteAnswerBatch(ctx, groupId)) ||
    (await deleteSessionBatch(ctx, groupId)) ||
    (await deletePlayerBatch(ctx, groupId))
  );
}

async function deleteAnswerBatch(ctx: MutationCtx, groupId: Id<"groups">) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
    .take(CHILD_DELETE_BATCH_SIZE);
  for (const answer of answers) await ctx.db.delete("answers", answer._id);
  return answers.length > 0;
}

async function deleteSessionBatch(ctx: MutationCtx, groupId: Id<"groups">) {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
    .take(CHILD_DELETE_BATCH_SIZE);
  for (const session of sessions) await ctx.db.delete("sessions", session._id);
  return sessions.length > 0;
}

async function deletePlayerBatch(ctx: MutationCtx, groupId: Id<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(CHILD_DELETE_BATCH_SIZE);
  for (const player of players) await ctx.db.delete("players", player._id);
  return players.length > 0;
}
