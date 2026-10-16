import { v } from "convex/values";
import {
  addMonths,
  bookingWindow,
  monthDays,
  monthOf,
  todayUtc,
  type IsoDate,
} from "../shared/dates";
import { MAX_CLAIMED_PLAYERS_PER_ACCOUNT, MAX_GROUPS_PER_GM } from "../shared/limits";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { remindersConfigured } from "./mail";
import { fail } from "./model/errors";
import { currentAccount, requireAccount } from "./model/access";
import { remindersOn } from "./model/reminderLinks";
import { groupTimeOf, sessionTimeAndPlace, sessionTimeAndPlaceFields } from "./model/timeAndPlace";
import { datedSession } from "./schema";
import { datedSessionOf } from "./sessionLifecycle";

const UPCOMING_SESSIONS = 5;
const DAY = 86_400_000;

const upcomingSessions = v.array(
  v.object({ ...datedSession.fields, ...sessionTimeAndPlaceFields }),
);
const runningGroup = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  timeZone: v.string(),
  upcomingSessions,
});

const playingGroup = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  shareToken: v.string(),
  playerId: v.id("players"),
  playerName: v.string(),
  timeZone: v.string(),
  upcomingSessions,
  openDates: v.number(),
});

export const groups = query({
  args: { today: v.string() },
  returns: v.union(
    v.object({ running: v.array(runningGroup), playing: v.array(playingGroup) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    if (account === null) return null;
    const today = trustedToday(args.today);
    const [running, playing] = await Promise.all([
      groupsRunBy(ctx, account, today),
      groupsPlayedBy(ctx, account, today),
    ]);
    return { running, playing };
  },
});

function trustedToday(clientToday: string): IsoDate {
  const now = Date.now();
  const trusted = [now - DAY, now, now + DAY].map(todayUtc);
  return trusted.includes(clientToday) ? clientToday : todayUtc(now);
}

async function groupsRunBy(ctx: QueryCtx, account: Doc<"users">, today: IsoDate) {
  const groups = await ctx.db
    .query("groups")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", account._id))
    .take(MAX_GROUPS_PER_GM);
  return await Promise.all(
    groups.map(async (group) => ({
      groupId: group._id,
      name: group.name,
      timeZone: groupTimeOf(group).timeZone,
      upcomingSessions: await upcomingSessionsOf(ctx, group, today),
    })),
  );
}

async function groupsPlayedBy(ctx: QueryCtx, account: Doc<"users">, today: IsoDate) {
  const claimedPlayers = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", account._id))
    .take(MAX_CLAIMED_PLAYERS_PER_ACCOUNT);
  const cards = await Promise.all(claimedPlayers.map((player) => playingCard(ctx, player, today)));
  return cards.filter((card) => card !== null);
}

async function playingCard(ctx: QueryCtx, player: Doc<"players">, today: IsoDate) {
  const group = await ctx.db.get("groups", player.groupId);
  if (group === null) return null;
  const [upcomingSessions, openDates] = await Promise.all([
    upcomingSessionsOf(ctx, group, today),
    openDatesOf(ctx, player._id, today),
  ]);
  return {
    groupId: group._id,
    name: group.name,
    shareToken: group.shareToken,
    playerId: player._id,
    playerName: player.name,
    timeZone: groupTimeOf(group).timeZone,
    upcomingSessions,
    openDates,
  };
}

async function upcomingSessionsOf(ctx: QueryCtx, group: Doc<"groups">, today: IsoDate) {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", group._id).gte("date", today))
    .take(UPCOMING_SESSIONS);
  return sessions.map((session) => ({
    ...datedSessionOf(session),
    ...sessionTimeAndPlace(group, session),
  }));
}

async function openDatesOf(ctx: QueryCtx, playerId: Id<"players">, today: IsoDate) {
  const { first, last } = bookingWindow(today);
  const bookableDays = daysBetween(first, last);
  const answered = await ctx.db
    .query("answers")
    .withIndex("by_playerId_and_date", (q) =>
      q.eq("playerId", playerId).gte("date", first).lte("date", last),
    )
    .take(bookableDays);
  return bookableDays - answered.length;
}

function daysBetween(first: IsoDate, last: IsoDate) {
  let days = 0;
  for (let month = monthOf(first); month <= monthOf(last); month = addMonths(month, 1)) {
    days += monthDays(month).filter((date) => first <= date && date <= last).length;
  }
  return days;
}

export const notificationSettings = query({
  args: {},
  returns: v.union(
    v.object({ sessionEmails: v.boolean(), reminders: v.union(v.boolean(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) return null;
    return {
      sessionEmails: account.sessionEmailsEnabled !== false,
      reminders: remindersConfigured() ? remindersOn(account) : null,
    };
  },
});

export const setSessionEmails = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const account = await currentAccount(ctx);
    if (!account) fail({ code: "UNAUTHENTICATED" });
    await ctx.db.patch("users", account._id, { sessionEmailsEnabled: enabled });
    return null;
  },
});

export const setReminders = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const account = await requireAccount(ctx);
    await ctx.db.patch("users", account._id, { remindersEnabled: enabled });
    return null;
  },
});
