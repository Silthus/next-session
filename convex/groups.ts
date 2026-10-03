import { v } from "convex/values";
import { normalizeName } from "../shared/names";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { currentGm, findOwnedGroup, ownedGroup, requireGm, touchGroup } from "./model/access";
import { fail } from "./model/errors";
import {
  canUndoRotate,
  deleteChildBatch,
  deleteGroup,
  forgetUndoRotate as forgetUndo,
  ensureRoomForAnotherGroup,
  groupsOwnedBy,
  insertGroup,
  rotateShareToken as rotate,
  undoRotateShareToken as undoRotate,
} from "./model/groups";
import { enforceRateLimit } from "./model/rateLimits";

const groupListItem = v.object({
  id: v.id("groups"),
  name: v.string(),
  playerCount: v.number(),
});

const groupView = v.object({
  id: v.id("groups"),
  name: v.string(),
  shareToken: v.string(),
  expiresAt: v.optional(v.number()),
  canUndoRotate: v.boolean(),
});

export const mine = query({
  args: {},
  returns: v.array(groupListItem),
  handler: async (ctx) => {
    const gm = await currentGm(ctx);
    if (gm === null) return [];
    const groups = await groupsOwnedBy(ctx, gm._id);
    return await Promise.all(groups.map((group) => toListItem(ctx, group)));
  },
});

async function toListItem(ctx: QueryCtx, group: Doc<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", group._id))
    .collect();
  return { id: group._id, name: group.name, playerCount: players.length };
}

export const get = query({
  args: { groupId: v.string() },
  returns: v.union(groupView, v.null()),
  handler: async (ctx, { groupId }) => {
    const group = await findOwnedGroup(ctx, groupId);
    if (group === null) return null;
    return {
      id: group._id,
      name: group.name,
      shareToken: group.shareToken,
      expiresAt: group.expiresAt,
      canUndoRotate: canUndoRotate(group),
    };
  },
});

export const create = mutation({
  args: {},
  returns: v.id("groups"),
  handler: async (ctx) => {
    const gm = await requireGm(ctx);
    await ensureRoomForAnotherGroup(ctx, gm);
    await enforceRateLimit(ctx, "createGroup", gm._id);
    return await insertGroup(ctx, gm);
  },
});

export const rename = mutation({
  args: { groupId: v.id("groups"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { groupId, name }) => {
    const { gm, group } = await ownedGroup(ctx, groupId);
    const normalized = normalizeName(name);
    if (normalized === "INVALID_NAME") fail({ code: "INVALID_NAME" });
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await ctx.db.patch("groups", group._id, { name: normalized.name });
    await touchGroup(ctx, group);
    return null;
  },
});

export const remove = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const { gm, group } = await ownedGroup(ctx, groupId);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await deleteGroup(ctx, group);
    return null;
  },
});

export const rotateShareToken = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const { gm, group } = await ownedGroup(ctx, groupId);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await rotate(ctx, group);
    await touchGroup(ctx, group);
    return null;
  },
});

export const undoRotateShareToken = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const { gm, group } = await ownedGroup(ctx, groupId);
    await enforceRateLimit(ctx, "gmEdit", gm._id);
    await undoRotate(ctx, group);
    await touchGroup(ctx, group);
    return null;
  },
});

export const deleteChildren = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    if (await deleteChildBatch(ctx, groupId)) {
      await ctx.scheduler.runAfter(0, internal.groups.deleteChildren, { groupId });
    }
    return null;
  },
});

export const forgetUndoRotate = internalMutation({
  args: { groupId: v.id("groups"), rotatedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { groupId, rotatedAt }) => {
    await forgetUndo(ctx, groupId, rotatedAt);
    return null;
  },
});
