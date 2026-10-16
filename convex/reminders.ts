import { v } from "convex/values";
import { todayUtc } from "../shared/dates";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import { reminderDueAt, type ReminderLead } from "../shared/sessionTime";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { reminderLead, reminderSend, remindersConfigured, requestReminder } from "./mail";
import { remindersOffLinkOf, shareLinkOf } from "./model/links";
import { claimedPlayerIn } from "./model/players";
import { reminderLinkTokenFor, remindersOn } from "./model/reminderLinks";
import { accountDistinctId, isTestAddress, PRODUCT, serverLog } from "./model/telemetry";
import { groupTimeOf } from "./model/timeAndPlace";

const LEADS: ReminderLead[] = ["day", "hours"];
const LATEST_SEND_MS = 5 * 60_000;
const DAY = 24 * 60 * 60_000;
const BACKFILL_PAGE_SIZE = 50;

const reminderJob = {
  sessionId: v.id("sessions"),
  lead: reminderLead,
  revision: v.number(),
  timeZone: v.string(),
};

const reminderBody = v.object({
  distinct_id: v.string(),
  product: v.string(),
  email: v.string(),
  group_name: v.string(),
  date_label: v.string(),
  start_label: v.string(),
  location: v.optional(v.string()),
  lead: reminderLead,
  player_url: v.string(),
  reminders_off_url: v.string(),
});

type ScheduledSnapshot = NonNullable<Doc<"sessions">["published"]> & { start: number };

export async function sessionPublished(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  group: Doc<"groups">,
) {
  if (remindersConfigured()) await scheduleReminders(ctx, session, group);
}

export const scheduleUpcoming = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    from: v.optional(v.string()),
    scheduledSoFar: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { cursor, from = todayUtc(Date.now() - DAY), scheduledSoFar = 0 }) => {
    if (!remindersConfigured()) return null;
    const page = await ctx.db
      .query("sessions")
      .withIndex("by_date", (q) => q.gte("date", from))
      .paginate({ cursor: cursor ?? null, numItems: BACKFILL_PAGE_SIZE });
    let scheduled = scheduledSoFar;
    for (const session of page.page.filter(lacksCurrentReminders)) {
      const group = await ctx.db.get("groups", session.groupId);
      if (group) scheduled += await scheduleReminders(ctx, session, group);
    }
    if (page.isDone) {
      await serverLog(ctx, "info", "Reminder backfill finished", {
        reminders_scheduled: scheduled,
      });
      return null;
    }
    await ctx.scheduler.runAfter(0, internal.reminders.scheduleUpcoming, {
      cursor: page.continueCursor,
      from,
      scheduledSoFar: scheduled,
    });
    return null;
  },
});

export const fire = internalMutation({
  args: reminderJob,
  returns: v.null(),
  handler: async (ctx, job) => {
    const session = await ctx.db.get("sessions", job.sessionId);
    const published = session && liveSnapshotOf(session, job.revision);
    if (!published || !remindersConfigured() || isLate(published, job.lead)) return null;
    for (const account of await remindableAccounts(ctx, session.groupId)) {
      await reminderLinkTokenFor(ctx, account);
      await requestReminder(ctx, { ...job, userId: account._id });
    }
    return null;
  },
});

export const recipient = internalQuery({
  args: reminderSend,
  returns: v.union(reminderBody, v.null()),
  handler: async (ctx, send) => {
    const session = await ctx.db.get("sessions", send.sessionId);
    const published = session && liveSnapshotOf(session, send.revision);
    if (!published) return null;
    const group = await ctx.db.get("groups", session.groupId);
    const claim = group && (await claimedPlayerIn(ctx, send.userId, group._id));
    const account = claim && (await ctx.db.get("users", send.userId));
    if (!group || !account || !isRemindable(account) || !account.reminderLinkToken) return null;
    const { timeZone } = send;
    return {
      distinct_id: accountDistinctId(account),
      product: PRODUCT,
      email: account.email,
      group_name: group.name,
      date_label: dateLabel(published.start, timeZone),
      start_label: startLabel(published.start, timeZone),
      ...(published.location === undefined ? {} : { location: published.location }),
      lead: send.lead,
      player_url: shareLinkOf(group),
      reminders_off_url: remindersOffLinkOf(account.reminderLinkToken),
    };
  },
});

async function scheduleReminders(ctx: MutationCtx, session: Doc<"sessions">, group: Doc<"groups">) {
  const published = scheduledSnapshotOf(session);
  if (published === null) return 0;
  const leadsAhead = LEADS.filter((lead) => reminderDueAt(published.start, lead) > Date.now());
  for (const lead of leadsAhead) {
    await ctx.scheduler.runAt(reminderDueAt(published.start, lead), internal.reminders.fire, {
      sessionId: session._id,
      lead,
      revision: published.revision,
      timeZone: groupTimeOf(group).timeZone,
    });
  }
  await ctx.db.patch("sessions", session._id, { remindersRevision: published.revision });
  return leadsAhead.length;
}

function lacksCurrentReminders(session: Doc<"sessions">) {
  return (
    session.published !== undefined && session.remindersRevision !== session.published.revision
  );
}

function scheduledSnapshotOf(session: Doc<"sessions">): ScheduledSnapshot | null {
  const { published } = session;
  if (published?.state !== "scheduled" || published.start === undefined) return null;
  return { ...published, start: published.start };
}

function liveSnapshotOf(session: Doc<"sessions">, revision: number) {
  const published = scheduledSnapshotOf(session);
  return published?.revision === revision ? published : null;
}

function isLate(published: ScheduledSnapshot, lead: ReminderLead) {
  return Date.now() > reminderDueAt(published.start, lead) + LATEST_SEND_MS;
}

async function remindableAccounts(ctx: QueryCtx, groupId: Id<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  const userIds = new Set(players.flatMap((player) => (player.userId ? [player.userId] : [])));
  const accounts = await Promise.all([...userIds].map((userId) => ctx.db.get("users", userId)));
  return accounts.filter((account) => account !== null && isRemindable(account));
}

function isRemindable(account: Doc<"users">): account is Doc<"users"> & { email: string } {
  return (
    remindersOn(account) && !account.isAnonymous && !!account.email && !isTestAddress(account.email)
  );
}

function dateLabel(instant: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(instant);
}

function startLabel(instant: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
}
