import { type Infer, v } from "convex/values";
import { invite, sessionUid } from "../shared/icalendar";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  calendarMailConfigured,
  calendarMessage,
  calendarSend,
  requestCalendarMails,
  requestSessionMail,
  sessionMailBody,
  sessionMailConfigured,
  sessionSend,
  type CalendarSend,
  type SessionSend,
} from "./mail";
import {
  calendarRecipients,
  isCalendarRecipient,
  receivesSessionMail,
  type SessionMailAccount,
} from "./model/recipients";
import { sessionMailCopy, type SessionChange } from "./model/sessionMailCopy";
import { accountDistinctId, PRODUCT } from "./model/telemetry";
import { groupTimeOf } from "./model/timeAndPlace";

const SITE = "https://next-session.link";
const CALENDAR_ADDRESS = "calendar@next-session.link";

type Published = NonNullable<Doc<"sessions">["published"]>;

export async function sessionPublished(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  previous: Doc<"sessions">["published"],
) {
  const { published } = session;
  if (published === undefined) return;
  if (calendarMailConfigured()) await broadcast(ctx, session, published, previous);
  else await requestWorkflowsSessionUpdates(ctx, session, published, previous);
}

async function broadcast(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  published: Published,
  previous: Published | undefined,
) {
  const change = changeOf(previous, published);
  const group = await ctx.db.get("groups", session.groupId);
  if (change === null || group === null) return;
  const sequence = (session.sequence ?? 0) + 1;
  await ctx.db.patch("sessions", session._id, { sequence });
  const stamp = Date.now();
  const sends: CalendarSend[] = [];
  for (const userId of await calendarRecipients(ctx, group)) {
    const send = {
      kind: "broadcast",
      change,
      sessionId: session._id,
      userId,
      revision: published.revision,
      sequence,
      stamp,
    } as const;
    if (await broadcastTarget(ctx, send)) sends.push(send);
  }
  await requestCalendarMails(ctx, sends);
}

function changeOf(previous: Published | undefined, published: Published): SessionChange | null {
  const wasScheduled = previous?.state === "scheduled";
  if (published.state === "cancelled") return wasScheduled ? "cancelled" : null;
  return wasScheduled ? "changed" : "set";
}

export const calendarMail = internalQuery({
  args: { send: calendarSend },
  returns: v.union(calendarMessage, v.null()),
  handler: async (ctx, { send }) => {
    const target = await broadcastTarget(ctx, send);
    return target === null ? null : calendarMessageFor(target, send);
  },
});

type BroadcastTarget = {
  session: Doc<"sessions">;
  group: Doc<"groups">;
  account: SessionMailAccount;
  entry: { start: number; end: number; summary: string; location?: string; state: string };
};

async function broadcastTarget(
  ctx: QueryCtx,
  { sessionId, userId, revision }: CalendarSend,
): Promise<BroadcastTarget | null> {
  const session = await ctx.db.get("sessions", sessionId);
  const published = session?.published;
  if (!session || published?.revision !== revision) return null;
  const { start, end, summary, location, state } = published;
  if (start === undefined || end === undefined || summary === undefined) return null;
  const group = await ctx.db.get("groups", session.groupId);
  if (!group || !(await isCalendarRecipient(ctx, group, userId))) return null;
  const account = await ctx.db.get("users", userId);
  if (!receivesSessionMail(account)) return null;
  const entry = { start, end, summary, state, ...(location === undefined ? {} : { location }) };
  return { session, group, account, entry };
}

function calendarMessageFor(
  { session, group, account, entry }: BroadcastTarget,
  { change, sequence, stamp }: CalendarSend,
): Infer<typeof calendarMessage> {
  const runsGroup = group.ownerId === account._id;
  const calendarLink = runsGroup ? `${SITE}/g/${group._id}` : `${SITE}/me`;
  const window = { start: entry.start, end: entry.end };
  const uid = sessionUid(session._id);
  const kind = entry.state === "cancelled" ? "cancel" : "request";
  const copy = sessionMailCopy({
    change,
    reader: runsGroup ? "gm" : "player",
    groupName: entry.summary,
    date: session.date,
    window,
    timeZone: groupTimeOf(group).timeZone,
    ...(entry.location === undefined ? {} : { location: entry.location }),
    groupLink: runsGroup ? calendarLink : shareLinkOf(group),
  });
  const calendar = invite({
    kind,
    organizer: CALENDAR_ADDRESS,
    attendee: account.email,
    entry: {
      uid,
      sequence,
      stamp,
      window,
      status: kind === "cancel" ? "CANCELLED" : "CONFIRMED",
      summary: entry.summary,
      ...(entry.location === undefined ? {} : { location: entry.location }),
      description: `Open your group: ${calendarLink}`,
      url: calendarLink,
    },
  });
  return {
    to: account.email,
    ...copy,
    invite: { kind, calendar },
    idempotencyKey: `calendar/${uid}/${sequence}/${account._id}`,
  };
}

function shareLinkOf(group: Doc<"groups">) {
  return `${SITE}/s/${encodeURIComponent(group.shareToken)}`;
}

async function requestWorkflowsSessionUpdates(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  published: Published,
  previous: Published | undefined,
) {
  if (published.state === previous?.state || !sessionMailConfigured()) return;
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
  if (!receivesSessionMail(account)) return null;
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
