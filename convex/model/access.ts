import { getAuthUserId } from "@convex-dev/auth/server";
import { UNSAVED_GROUP_QUIET_DAYS } from "../../shared/limits";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

const DAY = 86_400_000;

export async function currentGm(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const subject = await getAuthUserId(ctx);
  const userId = subject === null ? null : ctx.db.normalizeId("users", subject);
  return userId === null ? null : await ctx.db.get("users", userId);
}

export async function requireGm(ctx: QueryCtx): Promise<Doc<"users">> {
  return (await currentGm(ctx)) ?? fail({ code: "UNAUTHENTICATED" });
}

export async function findOwnedGroup(ctx: QueryCtx, rawGroupId: string) {
  const gm = await currentGm(ctx);
  const groupId = ctx.db.normalizeId("groups", rawGroupId);
  return gm === null || groupId === null ? null : await groupOwnedBy(ctx, gm, groupId);
}

export async function ownedGroup(ctx: QueryCtx, groupId: Id<"groups">) {
  const gm = await requireGm(ctx);
  const group = (await groupOwnedBy(ctx, gm, groupId)) ?? fail({ code: "NOT_FOUND" });
  return { gm, group };
}

export async function ownedPlayer(ctx: QueryCtx, playerId: Id<"players">) {
  const gm = await requireGm(ctx);
  const { group, child: player } = await inGroupOwnedBy(
    ctx,
    gm,
    await ctx.db.get("players", playerId),
  );
  return { gm, group, player };
}

export async function ownedSession(ctx: QueryCtx, sessionId: Id<"sessions">) {
  const gm = await requireGm(ctx);
  const { group, child: session } = await inGroupOwnedBy(
    ctx,
    gm,
    await ctx.db.get("sessions", sessionId),
  );
  return { gm, group, session };
}

async function inGroupOwnedBy<Child extends { groupId: Id<"groups"> }>(
  ctx: QueryCtx,
  gm: Doc<"users">,
  child: Child | null,
) {
  const group = child === null ? null : await groupOwnedBy(ctx, gm, child.groupId);
  if (child === null || group === null) fail({ code: "NOT_FOUND" });
  return { group, child };
}

async function groupOwnedBy(ctx: QueryCtx, gm: Doc<"users">, groupId: Id<"groups">) {
  const group = await ctx.db.get("groups", groupId);
  return group?.ownerId === gm._id ? group : null;
}

export async function groupByShareToken(ctx: QueryCtx, shareToken: string) {
  return await ctx.db
    .query("groups")
    .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
    .unique();
}

export async function playerOnShareLink(
  ctx: QueryCtx,
  shareToken: string,
  playerId: Id<"players">,
) {
  const group = await groupByShareToken(ctx, shareToken);
  const player = await ctx.db.get("players", playerId);
  if (group === null || player === null || player.groupId !== group._id) {
    fail({ code: "NOT_FOUND" });
  }
  return { group, player };
}

export async function findPlayerOnShareLink(
  ctx: QueryCtx,
  shareToken: string,
  rawPlayerId: string,
) {
  const group = await groupByShareToken(ctx, shareToken);
  const playerId = ctx.db.normalizeId("players", rawPlayerId);
  if (group === null || playerId === null) return null;
  const player = await ctx.db.get("players", playerId);
  return player?.groupId === group._id ? player : null;
}

export function expiryFromNow() {
  return Date.now() + UNSAVED_GROUP_QUIET_DAYS * DAY;
}

export async function touchGroup(ctx: MutationCtx, group: Doc<"groups">) {
  if (group.expiresAt === undefined) return;
  const expiresAt = expiryFromNow();
  if (expiresAt - group.expiresAt >= DAY) await ctx.db.patch("groups", group._id, { expiresAt });
}
