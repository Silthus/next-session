import { v } from "convex/values";
import { feed, sessionUid, type CalendarEntry } from "../shared/icalendar";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { httpAction, internalQuery } from "./_generated/server";
import { groupByShareToken } from "./model/access";
import { upcomingSessions } from "./model/upcomingSessions";

declare const process: { env: Record<string, string | undefined> };

const DOWNLOAD_PATH = /^\/cal\/s\/([A-Za-z0-9_-]+)\.ics$/;
const UNSENT_SEQUENCE = 0;

const DOWNLOAD_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "private, max-age=900",
  "Content-Disposition": 'attachment; filename="next-session.ics"',
};

export const downloadGroupCalendar = httpAction(async (ctx, request) => {
  const shareToken = DOWNLOAD_PATH.exec(new URL(request.url).pathname)?.[1];
  const calendar =
    shareToken === undefined
      ? null
      : await ctx.runQuery(internal.calendarFiles.groupDownload, {
          shareToken,
          servedAt: Date.now(),
        });
  if (calendar === null) return new Response(null, { status: 404 });
  return new Response(calendar, { headers: DOWNLOAD_HEADERS });
});

export const groupDownload = internalQuery({
  args: { shareToken: v.string(), servedAt: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { shareToken, servedAt }) => {
    const group = await groupByShareToken(ctx, shareToken);
    if (group === null) return null;
    const upcoming = await upcomingSessions(ctx, group._id, servedAt);
    const shareLink = shareLinkOf(group);
    const entries = upcoming
      .map((session) => publishedEntryOf(session, { url: shareLink, stamp: servedAt }))
      .filter((entry): entry is CalendarEntry => entry?.status === "CONFIRMED");
    return feed(group.name, entries);
  },
});

function shareLinkOf(group: Doc<"groups">) {
  return new URL(`/s/${encodeURIComponent(group.shareToken)}`, process.env.SITE_URL).href;
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
