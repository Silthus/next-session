import { MAX_PLAYERS_PER_GROUP } from "../../shared/limits";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isTestAddress } from "./telemetry";

export async function calendarRecipients(ctx: QueryCtx, group: Doc<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", group._id))
    .take(MAX_PLAYERS_PER_GROUP);
  const claimants = players.flatMap((player) => (player.userId ? [player.userId] : []));
  return [...new Set([group.ownerId, ...claimants])];
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

export type SessionMailAccount = Doc<"users"> & { email: string };

export function receivesSessionMail(account: Doc<"users"> | null): account is SessionMailAccount {
  return (
    account !== null &&
    account.sessionEmailsEnabled !== false &&
    account.isAnonymous !== true &&
    account.email !== undefined &&
    account.email !== "" &&
    !isTestAddress(account.email)
  );
}
