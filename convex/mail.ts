import { ActionRetrier } from "@convex-dev/action-retrier";
import { v, type Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { todayUtc } from "../shared/dates";
import { calendarContentType } from "../shared/icalendar";
import { SESSION_CHANGES } from "./model/sessionMailCopy";
import { accountDistinctId, isTestAddress, PRODUCT, serverLog } from "./model/telemetry";
import { frozenEntry, mailProvider, sessionState } from "./schema";

declare const process: { env: Record<string, string | undefined> };

const MAX_ATTEMPTS = 4;
const SEND_TIMEOUT_MS = 10_000;
const TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;
const RESEND_URL = "https://api.resend.com/emails";
export const CALENDAR_ADDRESS = "calendar@next-session.link";
const CALENDAR_SENDER = `Next Session <${CALENDAR_ADDRESS}>`;
const CALENDAR_SEND_SPACING_MS = 600;
const DAILY_WARNING_AT = 80;
const DAILY_LIMIT = 100;

const retrier = new ActionRetrier(components.actionRetrier, {
  maxFailures: MAX_ATTEMPTS - 1,
  initialBackoffMs: 5_000,
  base: 4,
});

export const sessionMailBody = v.object({
  distinct_id: v.string(),
  product: v.string(),
  email: v.string(),
  group_name: v.string(),
  date_label: v.string(),
  change: sessionState,
  player_url: v.string(),
});

export const sessionSend = {
  sessionId: v.id("sessions"),
  userId: v.id("users"),
  change: sessionState,
};
export type SessionSend = Infer<ReturnType<typeof v.object<typeof sessionSend>>>;

const publishedSend = {
  sessionId: v.id("sessions"),
  userId: v.id("users"),
  revision: v.number(),
  sequence: v.number(),
  stamp: v.number(),
  timeZone: v.string(),
};

export const calendarSend = v.union(
  v.object({
    kind: v.literal("broadcast"),
    change: v.union(...SESSION_CHANGES.map((change) => v.literal(change))),
    ...publishedSend,
  }),
  v.object({ kind: v.literal("invite"), ...publishedSend }),
  v.object({
    kind: v.literal("withdraw"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    date: v.string(),
    entry: frozenEntry,
    stamp: v.number(),
  }),
  v.object({
    kind: v.literal("deletionCancel"),
    userId: v.id("users"),
    reader: v.union(v.literal("gm"), v.literal("player")),
    date: v.string(),
    entry: frozenEntry,
    stamp: v.number(),
  }),
);
export type CalendarSend = Infer<typeof calendarSend>;

export const calendarMessage = v.object({
  to: v.string(),
  subject: v.string(),
  text: v.string(),
  html: v.string(),
  invite: v.object({
    kind: v.union(v.literal("request"), v.literal("cancel"), v.literal("withdraw")),
    calendar: v.string(),
  }),
  idempotencyKey: v.string(),
});

type MailProvider = Infer<typeof mailProvider>;

export const reminderLead = v.union(v.literal("day"), v.literal("hours"));

export const reminderSend = {
  sessionId: v.id("sessions"),
  userId: v.id("users"),
  revision: v.number(),
  lead: reminderLead,
  timeZone: v.string(),
};
type ReminderSend = Infer<ReturnType<typeof v.object<typeof reminderSend>>>;

const mailKind = v.union(v.literal("welcome"), v.literal("tips"));
type MailKind = Infer<typeof mailKind>;

const webhookBody = v.object({
  distinct_id: v.string(),
  product: v.string(),
  email: v.string(),
  tips_confirm_url: v.optional(v.string()),
});
type WebhookBody = Infer<typeof webhookBody>;

export type MailRequest = { kind: MailKind; user: Doc<"users">; tipsConfirmUrl?: string };

const WEBHOOK_URL_VARIABLES: Record<MailKind | "session" | "reminder", string> = {
  welcome: "POSTHOG_WELCOME_WEBHOOK_URL",
  tips: "POSTHOG_TIPS_WEBHOOK_URL",
  session: "POSTHOG_SESSION_WEBHOOK_URL",
  reminder: "POSTHOG_REMINDER_WEBHOOK_URL",
};

export async function requestMail(ctx: MutationCtx, { kind, user, tipsConfirmUrl }: MailRequest) {
  const { email } = user;
  if (webhookFor(kind) === null || email === undefined || isTestAddress(email)) return;
  const body: WebhookBody = {
    distinct_id: accountDistinctId(user),
    product: PRODUCT,
    email,
    ...(tipsConfirmUrl === undefined ? {} : { tips_confirm_url: tipsConfirmUrl }),
  };
  await recordMailVolume(ctx, "workflows", kind === "tips" ? 2 : 1);
  await retrier.run(ctx, internal.mail.send, { kind, body });
}

export const send = internalAction({
  args: { kind: mailKind, body: webhookBody },
  returns: v.null(),
  handler: async (_ctx, { kind, body }) => {
    const webhook = webhookFor(kind);
    if (webhook === null) {
      console.error(`The ${kind} mail webhook is no longer configured, request dropped`);
      return null;
    }
    const { status } = await post(webhook, body);
    if (isRetryable(status)) throw new Error(`The ${kind} mail webhook answered HTTP ${status}`);
    if (status >= 400) console.error(`The ${kind} mail webhook refused: HTTP ${status}, dropped`);
    return null;
  },
});

function webhookFor(kind: keyof typeof WEBHOOK_URL_VARIABLES) {
  const secret = process.env.POSTHOG_MAIL_WEBHOOK_SECRET;
  const url = process.env[WEBHOOK_URL_VARIABLES[kind]];
  return secret && url ? { secret, url } : null;
}

async function post({ secret, url }: { secret: string; url: string }, body: WebhookBody) {
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
}

function isRetryable(status: number) {
  return status === TOO_MANY_REQUESTS || status >= FIRST_SERVER_ERROR;
}

export async function requestSessionMail(ctx: MutationCtx, send: SessionSend) {
  if (!webhookFor("session")) return;
  await recordMailVolume(ctx, "workflows", 1);
  await retrier.run(ctx, internal.mail.sendSession, send);
}

export const sendSession = internalAction({
  args: sessionSend,
  returns: v.null(),
  handler: async (ctx, send) => {
    const webhook = webhookFor("session");
    if (!webhook) return null;
    const body = await ctx.runQuery(internal.sessionMail.recipient, send);
    if (!body) return null;
    const { status } = await post(webhook, body);
    if (status >= FIRST_SERVER_ERROR)
      throw new Error(`The session mail webhook answered HTTP ${status}`);
    if (status >= 400) console.error(`The session mail webhook refused: HTTP ${status}, dropped`);
    return null;
  },
});

export async function requestReminder(ctx: MutationCtx, send: ReminderSend) {
  if (!webhookFor("reminder")) return;
  await recordMailVolume(ctx, "workflows", 1);
  await retrier.run(ctx, internal.mail.sendReminder, send);
}

export const sendReminder = internalAction({
  args: reminderSend,
  returns: v.null(),
  handler: async (ctx, send) => {
    const webhook = webhookFor("reminder");
    if (!webhook) return null;
    const body = await ctx.runQuery(internal.reminders.recipient, send);
    if (!body) return null;
    const { status } = await post(webhook, body);
    if (status >= FIRST_SERVER_ERROR)
      throw new Error(`The Reminder webhook answered HTTP ${status}`);
    if (status >= 400) console.error(`The Reminder webhook refused: HTTP ${status}, dropped`);
    return null;
  },
});

export function sessionMailConfigured() {
  return webhookFor("session") !== null;
}

export function remindersConfigured() {
  return webhookFor("reminder") !== null;
}

export function calendarMailConfigured() {
  return resendApiKey() !== undefined;
}

export async function requestCalendarMails(ctx: MutationCtx, sends: CalendarSend[]) {
  if (!calendarMailConfigured() || sends.length === 0) return 0;
  await recordMailVolume(ctx, "resend", sends.length);
  for (const [index, send] of sends.entries()) {
    await retrier.runAfter(ctx, index * CALENDAR_SEND_SPACING_MS, internal.mail.sendCalendar, {
      send,
    });
  }
  return sends.length * CALENDAR_SEND_SPACING_MS;
}

export const sendCalendar = internalAction({
  args: { send: calendarSend },
  returns: v.null(),
  handler: async (ctx, { send }) => {
    const apiKey = resendApiKey();
    if (apiKey === undefined) return null;
    const mail = await ctx.runQuery(internal.sessionMail.calendarMail, { send });
    if (mail === null) return null;
    const { status } = await postToResend(apiKey, mail, resendRequestOf(mail));
    if (isRetryable(status)) throw new Error(`Resend answered HTTP ${status}`);
    if (status >= 400) console.error(`Resend refused a calendar mail: HTTP ${status}, dropped`);
    return null;
  },
});

function resendApiKey() {
  return process.env.RESEND_API_KEY || undefined;
}

function resendRequestOf(mail: Infer<typeof calendarMessage>) {
  return JSON.stringify({
    from: CALENDAR_SENDER,
    to: [mail.to],
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: [
      {
        filename: "invite.ics",
        content: base64(mail.invite.calendar),
        content_type: calendarContentType(mail.invite.kind),
      },
    ],
  });
}

async function postToResend(apiKey: string, mail: Infer<typeof calendarMessage>, body: string) {
  return await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": `${mail.idempotencyKey}/${fingerprintOf(body)}`,
    },
    body,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
}

function fingerprintOf(text: string) {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  return [high, low].map((half) => (half >>> 0).toString(16).padStart(8, "0")).join("");
}

function base64(text: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function calendarMailsToday(ctx: QueryCtx) {
  return (await mailVolumeOn(ctx, "resend", today()))?.count ?? 0;
}

async function recordMailVolume(ctx: MutationCtx, provider: MailProvider, count: number) {
  const day = today();
  const volume = await mailVolumeOn(ctx, provider, day);
  const before = volume?.count ?? 0;
  const after = before + count;
  if (volume) await ctx.db.patch("mailVolume", volume._id, { provider, count: after });
  else {
    const volumeId = await ctx.db.insert("mailVolume", { provider, day, count: after });
    await ctx.scheduler.runAfter(2 * 86_400_000, internal.mail.expireVolume, { volumeId });
  }
  if (
    (before < DAILY_WARNING_AT && after >= DAILY_WARNING_AT) ||
    (before <= DAILY_LIMIT && after > DAILY_LIMIT)
  ) {
    await serverLog(ctx, "warn", "Daily mail volume warning", {
      provider,
      estimated_deliveries: after,
      daily_limit: DAILY_LIMIT,
      day,
    });
  }
}

function today() {
  return todayUtc(Date.now());
}

async function mailVolumeOn(ctx: QueryCtx, provider: MailProvider, day: string) {
  const counted = await ctx.db
    .query("mailVolume")
    .withIndex("by_provider_and_day", (q) => q.eq("provider", provider).eq("day", day))
    .unique();
  if (counted !== null || provider !== "workflows") return counted;
  return await ctx.db
    .query("mailVolume")
    .withIndex("by_provider_and_day", (q) => q.eq("provider", undefined).eq("day", day))
    .unique();
}

export const expireVolume = internalMutation({
  args: { volumeId: v.id("mailVolume") },
  returns: v.null(),
  handler: async (ctx, { volumeId }) => {
    if (await ctx.db.get("mailVolume", volumeId)) await ctx.db.delete("mailVolume", volumeId);
    return null;
  },
});
