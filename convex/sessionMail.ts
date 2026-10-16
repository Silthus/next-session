import { v } from "convex/values";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requestSessionMail,
  sessionMailBody,
  sessionMailConfigured,
  sessionSend,
  type SessionSend,
} from "./mail";
import { shareLinkOf } from "./model/links";
import { accountDistinctId, isTestAddress, PRODUCT } from "./model/telemetry";

export async function sessionPublished(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  previous: Doc<"sessions">["published"],
) {
  const { published } = session;
  if (published === undefined || published.state === previous?.state) return;
  if (!sessionMailConfigured()) return;
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", session.groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  const accounts = new Set(players.flatMap((player) => (player.userId ? [player.userId] : [])));
  for (const userId of accounts) {
    const send = { sessionId: session._id, userId, revision: published.revision };
    if (await bodyFor(ctx, send)) await requestSessionMail(ctx, send);
  }
}

export const recipient = internalQuery({
  args: sessionSend,
  returns: v.union(sessionMailBody, v.null()),
  handler: bodyFor,
});

async function bodyFor(ctx: QueryCtx, { sessionId, userId, revision }: SessionSend) {
  const session = await ctx.db.get("sessions", sessionId);
  const published = session?.published;
  if (!session || published?.revision !== revision) return null;
  const group = await ctx.db.get("groups", session.groupId);
  if (!group || group.ownerId === userId) return null;
  const player = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", userId).eq("groupId", group._id))
    .first();
  if (!player) return null;
  const account = await ctx.db.get("users", userId);
  if (
    !account ||
    account.sessionEmailsEnabled === false ||
    account.isAnonymous ||
    !account.email ||
    isTestAddress(account.email)
  )
    return null;
  return {
    distinct_id: accountDistinctId(account),
    product: PRODUCT,
    email: account.email,
    group_name: group.name,
    date_label: dateLabel(session.date),
    change: published.state,
    player_url: shareLinkOf(group),
  };
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
