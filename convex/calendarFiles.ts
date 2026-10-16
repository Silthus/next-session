import { v } from "convex/values";
import { bookingWindow, todayUtc, type IsoDate } from "../shared/dates";
import { feed, sessionUid, type CalendarEntry } from "../shared/icalendar";
import { MAX_CLAIMED_PLAYERS_PER_ACCOUNT, MAX_GROUPS_PER_GM } from "../shared/limits";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { httpAction, internalQuery, type QueryCtx } from "./_generated/server";
import { groupByShareToken } from "./model/access";
import { shareLinkOf, siteLink } from "./model/siteLinks";

const DOWNLOAD_PATH = /^\/cal\/s\/([A-Za-z0-9_-]+)\.ics$/;
const FEED_PATH = /^\/cal\/a\/([A-Za-z0-9_-]+)\.ics$/;
const FEED_CALENDAR_NAME = "Next Session";
const FEED_DAYS_BACK = 31;
const UNSENT_SEQUENCE = 0;
const DAY = 86_400_000;

const CALENDAR_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "private, max-age=900",
};

const DOWNLOAD_HEADERS = {
  ...CALENDAR_HEADERS,
  "Content-Disposition": 'attachment; filename="next-session.ics"',
};

type DateRange = { first: IsoDate; last: IsoDate };

export const downloadGroupCalendar = httpAction(async (ctx, request) => {
  const shareToken = tokenIn(request, DOWNLOAD_PATH);
  const calendar =
    shareToken === undefined
      ? null
      : await ctx.runQuery(internal.calendarFiles.groupDownload, {
          shareToken,
          servedAt: Date.now(),
        });
  return calendarResponse(calendar, DOWNLOAD_HEADERS);
});

export const serveAccountFeed = httpAction(async (ctx, request) => {
  const feedToken = tokenIn(request, FEED_PATH);
  const calendar =
    feedToken === undefined
      ? null
      : await ctx.runQuery(internal.calendarFiles.accountFeed, {
          feedToken,
          servedAt: Date.now(),
        });
  return calendarResponse(calendar, CALENDAR_HEADERS);
});

function tokenIn(request: Request, path: RegExp) {
  return path.exec(new URL(request.url).pathname)?.[1];
}

function calendarResponse(calendar: string | null, headers: Record<string, string>) {
  if (calendar === null) return new Response(null, { status: 404 });
  return new Response(calendar, { headers });
}

export const groupDownload = internalQuery({
  args: { shareToken: v.string(), servedAt: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { shareToken, servedAt }) => {
    const group = await groupByShareToken(ctx, shareToken);
    if (group === null) return null;
    const upcoming = bookingWindow(todayUtc(servedAt));
    const shareLink = shareLinkOf(group);
    const entries = (await publishedEntriesOf(ctx, group, upcoming, shareLink, servedAt)).filter(
      (entry) => entry.status === "CONFIRMED",
    );
    return feed(group.name, entries);
  },
});

export const accountFeed = internalQuery({
  args: { feedToken: v.string(), servedAt: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { feedToken, servedAt }) => {
    const account = await ctx.db
      .query("users")
      .withIndex("by_calendarFeedToken", (q) => q.eq("calendarFeedToken", feedToken))
      .unique();
    if (account === null) return null;
    const window = feedWindow(servedAt);
    const groups = await feedGroupsOf(ctx, account);
    const entries = await Promise.all(
      groups.map(({ group, url }) => publishedEntriesOf(ctx, group, window, url, servedAt)),
    );
    return feed(FEED_CALENDAR_NAME, entries.flat());
  },
});

function feedWindow(servedAt: number): DateRange {
  return {
    first: todayUtc(servedAt - FEED_DAYS_BACK * DAY),
    last: bookingWindow(todayUtc(servedAt)).last,
  };
}

async function feedGroupsOf(ctx: QueryCtx, account: Doc<"users">) {
  const run = await ctx.db
    .query("groups")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", account._id))
    .take(MAX_GROUPS_PER_GM);
  const played = await groupsPlayedBy(ctx, account, new Set(run.map((group) => group._id)));
  return [
    ...run.map((group) => ({ group, url: siteLink(`/g/${group._id}`) })),
    ...played.map((group) => ({ group, url: siteLink("/me") })),
  ];
}

async function groupsPlayedBy(ctx: QueryCtx, account: Doc<"users">, run: Set<Id<"groups">>) {
  const claimedPlayers = await ctx.db
    .query("players")
    .withIndex("by_userId_and_groupId", (q) => q.eq("userId", account._id))
    .take(MAX_CLAIMED_PLAYERS_PER_ACCOUNT);
  const playedGroupIds = new Set(claimedPlayers.map((player) => player.groupId));
  const groups = await Promise.all(
    [...playedGroupIds]
      .filter((groupId) => !run.has(groupId))
      .map((groupId) => ctx.db.get("groups", groupId)),
  );
  return groups.filter((group) => group !== null);
}

async function publishedEntriesOf(
  ctx: QueryCtx,
  group: Doc<"groups">,
  { first, last }: DateRange,
  url: string,
  stamp: number,
) {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) =>
      q.eq("groupId", group._id).gte("date", first).lte("date", last),
    )
    .take(daysIn({ first, last }));
  return sessions
    .map((session) => publishedEntryOf(session, { url, stamp }))
    .filter((entry) => entry !== null);
}

function daysIn({ first, last }: DateRange) {
  return (Date.parse(last) - Date.parse(first)) / DAY + 1;
}

function publishedEntryOf(
  session: Doc<"sessions">,
  { url, stamp }: { url: string; stamp: number },
): CalendarEntry | null {
  const { published } = session;
  if (published?.start === undefined || published.end === undefined) return null;
  if (published.summary === undefined) return null;
  return {
    uid: sessionUid(session._id),
    sequence: UNSENT_SEQUENCE,
    stamp,
    window: { start: published.start, end: published.end },
    status: published.state === "cancelled" ? "CANCELLED" : "CONFIRMED",
    summary: published.summary,
    ...(published.location === undefined ? {} : { location: published.location }),
    description: `Open the group on Next Session: ${url}`,
    url,
  };
}
