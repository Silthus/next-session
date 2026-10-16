import { v } from "convex/values";
import { bookingWindow, todayUtc } from "../shared/dates";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import {
  calendarMailConfigured,
  calendarMailsToday,
  requestCalendarMails,
  type CalendarSend,
} from "./mail";
import { serverLog } from "./model/telemetry";
import { inviteRoundOf, raiseSequence } from "./sessionMail";

const DAILY_SHARE = 50;
const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;

export const inviteScheduledSessions = internalMutation({
  args: {
    page: v.optional(v.object({ cursor: v.string(), today: v.string() })),
    sessionsInvited: v.optional(v.number()),
    invitesQueued: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { page, sessionsInvited = 0, invitesQueued = 0 }) => {
    if (!calendarMailConfigured()) return null;
    const today = page?.today ?? todayUtc(Date.now());
    const { first, last } = bookingWindow(today);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_date", (q) => q.gte("date", first).lte("date", last))
      .paginate({ cursor: page?.cursor ?? null, numItems: PAGE_SIZE });
    const sentToday = await calendarMailsToday(ctx);
    const sends: CalendarSend[] = [];
    let dayIsFull = false;
    for (const session of sessions.page.filter(neverSent)) {
      const round = await inviteRoundOf(ctx, session);
      if (round.length === 0) continue;
      if (!fitsTheDay(round.length, sentToday + sends.length)) {
        dayIsFull = true;
        break;
      }
      await raiseSequence(ctx, session);
      sends.push(...round);
      sessionsInvited++;
    }
    await requestCalendarMails(ctx, sends);
    invitesQueued += sends.length;
    const progress = { sessionsInvited, invitesQueued };
    if (dayIsFull)
      await ctx.scheduler.runAt(
        nextUtcMidnight(),
        internal.oneTimeInvites.inviteScheduledSessions,
        progress,
      );
    else if (!sessions.isDone)
      await ctx.scheduler.runAfter(0, internal.oneTimeInvites.inviteScheduledSessions, {
        page: { cursor: sessions.continueCursor, today },
        ...progress,
      });
    else
      await serverLog(ctx, "info", "One-time invites finished", {
        sessions_invited: sessionsInvited,
        invites_queued: invitesQueued,
      });
    return null;
  },
});

function neverSent(session: Doc<"sessions">) {
  return (session.sequence ?? 0) === 0;
}

function fitsTheDay(roundSize: number, sentToday: number) {
  const startsTheDay = sentToday === 0;
  return sentToday + roundSize <= DAILY_SHARE || (startsTheDay && roundSize > DAILY_SHARE);
}

function nextUtcMidnight() {
  return (Math.floor(Date.now() / DAY_MS) + 1) * DAY_MS;
}
