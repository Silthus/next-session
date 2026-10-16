import { MAX_PLAYERS_PER_GROUP } from "../../shared/limits";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isTestAddress } from "./telemetry";

export async function claimedAccountIds(ctx: QueryCtx, groupId: Id<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  return [...new Set(players.flatMap((player) => (player.userId ? [player.userId] : [])))];
}

export async function calendarRecipients(ctx: QueryCtx, group: Doc<"groups">) {
  return [...new Set([group.ownerId, ...(await claimedAccountIds(ctx, group._id))])];
}

export async function isCalendarRecipient(
  ctx: QueryCtx,
  group: Doc<"groups">,
  userId: Id<"users">,
) {
  if (group.ownerId === userId) return true;
  const claim = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", userId).eq("groupId", group._id))
    .first();
  return claim !== null;
}

export async function isInCalendarRecipientSet(
  ctx: QueryCtx,
  { groupId, userId }: { groupId: Id<"groups">; userId: Id<"users"> },
) {
  const group = await ctx.db.get("groups", groupId);
  return group !== null && (await isCalendarRecipient(ctx, group, userId));
}

export type MailableAccount = Doc<"users"> & { email: string };

export function isMailable(account: Doc<"users">): account is MailableAccount {
  return account.isAnonymous !== true && !!account.email && !isTestAddress(account.email);
}

export function receivesSessionMail(account: Doc<"users"> | null): account is MailableAccount {
  return account !== null && account.sessionEmailsEnabled !== false && isMailable(account);
}
