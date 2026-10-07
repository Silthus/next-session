import { v, type Infer } from "convex/values";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requestSessionMail, sessionMailBody, sessionMailConfigured } from "./mail";
import { accountDistinctId, isTestAddress, PRODUCT } from "./model/telemetry";

const UNDO_WINDOW_MS = 30_000;
export const sessionChange = {
  groupId: v.id("groups"),
  sessionId: v.id("sessions"),
  actorId: v.id("users"),
  date: v.string(),
  change: v.union(v.literal("scheduled"), v.literal("cancelled")),
  createdAt: v.number(),
  changedAt: v.number(),
};

export const sessionChanged = internalMutation({
  args: sessionChange,
  returns: v.null(),
  handler: async (ctx, change) => {
    await ctx.scheduler.runAfter(
      Math.max(0, change.changedAt + UNDO_WINDOW_MS + 1 - Date.now()),
      internal.notifications.fanOut,
      change,
    );
    return null;
  },
});

export const fanOut = internalMutation({
  args: sessionChange,
  returns: v.null(),
  handler: async (ctx, change) => {
    if (!(await currentGroup(ctx, change))) return null;
    const players = await ctx.db
      .query("players")
      .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", change.groupId))
      .take(MAX_PLAYERS_PER_GROUP);
    const accounts = new Set(players.flatMap((player) => (player.userId ? [player.userId] : [])));
    for (const userId of accounts) {
      if (await recipientBody(ctx, { ...change, userId })) {
        await requestSessionMail(ctx, { ...change, userId });
      }
    }
    return null;
  },
});

export const recipient = internalQuery({
  args: { ...sessionChange, userId: v.id("users") },
  returns: v.union(sessionMailBody, v.null()),
  handler: recipientBody,
});

export type SessionChange = Infer<ReturnType<typeof v.object<typeof sessionChange>>>;
type Recipient = SessionChange & { userId: import("./_generated/dataModel").Id<"users"> };

async function currentGroup(ctx: QueryCtx, change: SessionChange) {
  const group = await ctx.db.get("groups", change.groupId);
  if (!group) return null;
  const state = await ctx.db
    .query("sessionMailStates")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", group._id).eq("date", change.date))
    .unique();
  if (!state || state.sessionId !== change.sessionId || state.change !== change.change) return null;
  if (change.change === "scheduled") {
    const session = await ctx.db.get("sessions", change.sessionId);
    if (!session || session.groupId !== group._id || session.date !== change.date) return null;
  } else {
    const replacement = await ctx.db
      .query("sessions")
      .withIndex("by_groupId_and_date", (q) => q.eq("groupId", group._id).eq("date", change.date))
      .first();
    if (replacement) return null;
  }
  return group;
}

async function recipientBody(ctx: QueryCtx, change: Recipient) {
  if (change.userId === change.actorId) return null;
  const group = await currentGroup(ctx, change);
  if (!group) return null;
  const player = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) =>
      q.eq("userId", change.userId).eq("groupId", group._id),
    )
    .first();
  if (!player) return null;
  const account = await ctx.db.get("users", change.userId);
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
    date_label: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${change.date}T12:00:00Z`)),
    change: change.change,
    player_url: `https://next-session.link/s/${encodeURIComponent(group.shareToken)}`,
  };
}

export async function queueSessionMail(ctx: MutationCtx, change: Omit<SessionChange, "changedAt">) {
  if (!sessionMailConfigured()) return;
  const state = await ctx.db
    .query("sessionMailStates")
    .withIndex("by_groupId_and_date", (q) =>
      q.eq("groupId", change.groupId).eq("date", change.date),
    )
    .unique();
  const settled =
    change.change === "cancelled"
      ? state?.settled === true || Date.now() - change.createdAt > UNDO_WINDOW_MS
      : state?.change === "cancelled" &&
        state.settled === true &&
        Date.now() - state.changedAt <= UNDO_WINDOW_MS;
  const fields = {
    groupId: change.groupId,
    date: change.date,
    sessionId: change.sessionId,
    change: change.change,
    changedAt: Date.now(),
    settled,
    notify: change.change === "cancelled" ? settled : !settled,
  };
  const stateId = state ? state._id : await ctx.db.insert("sessionMailStates", fields);
  if (state) await ctx.db.patch("sessionMailStates", stateId, fields);
  await ctx.scheduler.runAfter(7 * 86_400_000, internal.notifications.expireState, {
    stateId,
    changedAt: fields.changedAt,
  });
  if (!fields.notify) return;
  await ctx.scheduler.runAfter(0, internal.notifications.sessionChanged, {
    ...change,
    changedAt: fields.changedAt,
  });
}

export const expireState = internalMutation({
  args: { stateId: v.id("sessionMailStates"), changedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { stateId, changedAt }) => {
    const state = await ctx.db.get("sessionMailStates", stateId);
    if (state?.changedAt === changedAt) await ctx.db.delete("sessionMailStates", stateId);
    return null;
  },
});
