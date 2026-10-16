import { type Infer, v } from "convex/values";
import { invite, sessionUid } from "../shared/icalendar";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import type { Doc, Id } from "./_generated/dataModel";
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
  isInCalendarRecipientSet,
  receivesSessionMail,
  type SessionMailAccount,
} from "./model/recipients";
import { sessionMailCopy, type SessionChange } from "./model/sessionMailCopy";
import { accountDistinctId, PRODUCT } from "./model/telemetry";
import { groupTimeOf } from "./model/timeAndPlace";
import { upcomingSessions } from "./model/upcomingSessions";

const SITE = "https://next-session.link";
const CALENDAR_ADDRESS = "calendar@next-session.link";
const PLAYER_CALENDAR_LINK = `${SITE}/me`;

type Published = NonNullable<Doc<"sessions">["published"]>;
type NightSend = Extract<CalendarSend, { kind: "broadcast" | "invite" }>;
type WithdrawSend = Extract<CalendarSend, { kind: "withdraw" }>;
type RecipientSetMember = { groupId: Id<"groups">; userId: Id<"users"> };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NightRound = DistributiveOmit<NightSend, "sessionId" | "userId" | "stamp">;

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
  const sequence = await raiseSequence(ctx, session);
  const { revision } = published;
  const sends = await roundOf(ctx, session, group, {
    kind: "broadcast",
    change,
    revision,
    sequence,
  });
  await requestCalendarMails(ctx, sends);
}

export async function inviteRoundOf(ctx: QueryCtx, session: Doc<"sessions">) {
  const { published } = session;
  const group = await ctx.db.get("groups", session.groupId);
  if (published?.state !== "scheduled" || group === null) return [];
  const { revision } = published;
  return await roundOf(ctx, session, group, {
    kind: "invite",
    revision,
    sequence: nextSequence(session),
  });
}

async function roundOf(
  ctx: QueryCtx,
  session: Doc<"sessions">,
  group: Doc<"groups">,
  round: NightRound,
) {
  const stamp = Date.now();
  const sends: NightSend[] = [];
  for (const userId of await calendarRecipients(ctx, group)) {
    const send = { ...round, sessionId: session._id, userId, stamp };
    if (await nightTarget(ctx, send)) sends.push(send);
  }
  return sends;
}

export async function raiseSequence(ctx: MutationCtx, session: Doc<"sessions">) {
  const sequence = nextSequence(session);
  await ctx.db.patch("sessions", session._id, { sequence });
  return sequence;
}

function nextSequence(session: Doc<"sessions">) {
  return (session.sequence ?? 0) + 1;
}

function changeOf(previous: Published | undefined, published: Published): SessionChange | null {
  const wasScheduled = previous?.state === "scheduled";
  if (published.state === "cancelled") return wasScheduled ? "cancelled" : null;
  return wasScheduled ? "changed" : "set";
}

export async function changeRecipientSet<Result>(
  ctx: MutationCtx,
  member: RecipientSetMember,
  change: () => Promise<Result>,
): Promise<Result> {
  const before = await isInCalendarRecipientSet(ctx, member);
  const result = await change();
  const after = await isInCalendarRecipientSet(ctx, member);
  await recipientSetChanged(ctx, { ...member, before, after });
  return result;
}

async function recipientSetChanged(
  ctx: MutationCtx,
  { groupId, userId, before, after }: RecipientSetMember & { before: boolean; after: boolean },
) {
  if (before === after || !calendarMailConfigured()) return;
  if (!receivesSessionMail(await ctx.db.get("users", userId))) return;
  const nights = await upcomingPublishedNights(ctx, groupId);
  const affected = after ? nights.filter(({ entry }) => entry.state === "scheduled") : nights;
  const stamp = Date.now();
  const sends: CalendarSend[] = [];
  for (const night of affected) {
    const sequence = await raiseSequence(ctx, night.session);
    sends.push(
      after
        ? inviteOf(night, userId, sequence, stamp)
        : withdrawalOf(night, userId, sequence, stamp),
    );
  }
  await requestCalendarMails(ctx, sends);
}

async function upcomingPublishedNights(ctx: QueryCtx, groupId: Id<"groups">) {
  const sessions = await upcomingSessions(ctx, groupId);
  return sessions.flatMap((session): PublishedNight[] => {
    const entry = entryOf(session.published);
    return entry === null ? [] : [{ session, entry }];
  });
}

function inviteOf(
  { session, entry }: PublishedNight,
  userId: Id<"users">,
  sequence: number,
  stamp: number,
): NightSend {
  const { revision } = entry;
  return { kind: "invite", sessionId: session._id, userId, revision, sequence, stamp };
}

function withdrawalOf(
  { session, entry: { start, end, summary } }: PublishedNight,
  userId: Id<"users">,
  sequence: number,
  stamp: number,
): WithdrawSend {
  return {
    kind: "withdraw",
    groupId: session.groupId,
    userId,
    date: session.date,
    entry: { uid: sessionUid(session._id), sequence, start, end, summary },
    stamp,
  };
}

export const calendarMail = internalQuery({
  args: { send: calendarSend },
  returns: v.union(calendarMessage, v.null()),
  handler: async (ctx, { send }) => {
    if (send.kind === "withdraw") return await withdrawalMail(ctx, send);
    const target = await nightTarget(ctx, send);
    return target === null ? null : nightMessageFor(target, send);
  },
});

type PublishedEntry = {
  start: number;
  end: number;
  summary: string;
  location?: string;
  state: Published["state"];
  revision: number;
};

type PublishedNight = { session: Doc<"sessions">; entry: PublishedEntry };

type NightTarget = {
  session: Doc<"sessions">;
  group: Doc<"groups">;
  account: SessionMailAccount;
  entry: PublishedEntry;
};

function entryOf(published: Published | undefined): PublishedEntry | null {
  if (published === undefined) return null;
  const { start, end, summary, location, state, revision } = published;
  if (start === undefined || end === undefined || summary === undefined) return null;
  return { start, end, summary, state, revision, ...(location === undefined ? {} : { location }) };
}

async function nightTarget(ctx: QueryCtx, send: NightSend): Promise<NightTarget | null> {
  const session = await ctx.db.get("sessions", send.sessionId);
  const published = session?.published;
  if (!session || published?.revision !== send.revision) return null;
  if (send.kind === "invite" && published.state !== "scheduled") return null;
  const entry = entryOf(published);
  if (entry === null) return null;
  const group = await ctx.db.get("groups", session.groupId);
  if (!group || !(await isCalendarRecipient(ctx, group, send.userId))) return null;
  const account = await ctx.db.get("users", send.userId);
  if (!receivesSessionMail(account)) return null;
  return { session, group, account, entry };
}

function nightMessageFor(
  { session, group, account, entry }: NightTarget,
  send: NightSend,
): Infer<typeof calendarMessage> {
  const runsGroup = group.ownerId === account._id;
  const calendarLink = runsGroup ? `${SITE}/g/${group._id}` : PLAYER_CALENDAR_LINK;
  const window = { start: entry.start, end: entry.end };
  const uid = sessionUid(session._id);
  const kind = entry.state === "cancelled" ? "cancel" : "request";
  const copy = sessionMailCopy({
    change: send.kind === "invite" ? "invite" : send.change,
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
      sequence: send.sequence,
      stamp: send.stamp,
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
    idempotencyKey: idempotencyKey(uid, send.sequence, account),
  };
}

async function withdrawalMail(
  ctx: QueryCtx,
  { groupId, userId, date, entry, stamp }: WithdrawSend,
): Promise<Infer<typeof calendarMessage> | null> {
  if (await isInCalendarRecipientSet(ctx, { groupId, userId })) return null;
  const account = await ctx.db.get("users", userId);
  if (!receivesSessionMail(account)) return null;
  const calendar = invite({
    kind: "withdraw",
    organizer: CALENDAR_ADDRESS,
    attendee: account.email,
    entry: {
      uid: entry.uid,
      sequence: entry.sequence,
      stamp,
      window: { start: entry.start, end: entry.end },
      status: "CANCELLED",
      summary: entry.summary,
      description: `Open your group: ${PLAYER_CALENDAR_LINK}`,
      url: PLAYER_CALENDAR_LINK,
    },
  });
  return {
    to: account.email,
    ...sessionMailCopy({ change: "withdraw", groupName: entry.summary, date }),
    invite: { kind: "withdraw", calendar },
    idempotencyKey: idempotencyKey(entry.uid, entry.sequence, account),
  };
}

function idempotencyKey(uid: string, sequence: number, account: SessionMailAccount) {
  return `calendar/${uid}/${sequence}/${account._id}`;
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
