import { v } from "convex/values";
import { bookingWindow, todayUtc } from "../shared/dates";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  calendarMailConfigured,
  calendarMailsToday,
  fitsTheDailyShare,
  nextUtcMidnight,
  requestCalendarMails,
  type CalendarSend,
} from "./mail";
import { serverLog } from "./model/telemetry";
import { awaitsWholeRound, setRoundOf, startWholeRound } from "./sessionMail";

const PAGE_SIZE = 20;

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
    for (const session of sessions.page.filter(awaitsWholeRound)) {
      const round = await setRoundOf(ctx, session);
      if (round.length === 0) continue;
      if (!fitsTheDailyShare(round.length, sentToday + sends.length)) {
        dayIsFull = true;
        break;
      }
      await startWholeRound(ctx, session);
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
