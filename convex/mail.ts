import { ActionRetrier } from "@convex-dev/action-retrier";
import { v, type Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { SessionChange } from "./notifications";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { accountDistinctId, isTestAddress, PRODUCT, serverLog } from "./model/telemetry";

declare const process: { env: Record<string, string | undefined> };

const MAX_ATTEMPTS = 4;
const SEND_TIMEOUT_MS = 10_000;
const TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;

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
  change: v.union(v.literal("scheduled"), v.literal("cancelled")),
  player_url: v.string(),
});

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

const WEBHOOK_URL_VARIABLES: Record<MailKind | "session", string> = {
  welcome: "POSTHOG_WELCOME_WEBHOOK_URL",
  tips: "POSTHOG_TIPS_WEBHOOK_URL",
  session: "POSTHOG_SESSION_WEBHOOK_URL",
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
  await recordMailVolume(ctx, kind === "tips" ? 2 : 1);
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

function webhookFor(kind: MailKind | "session") {
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

export async function requestSessionMail(
  ctx: MutationCtx,
  args: SessionChange & { userId: Id<"users"> },
) {
  if (!webhookFor("session")) return;
  await recordMailVolume(ctx, 1);
  await retrier.run(ctx, internal.mail.sendSession, args);
}

export const sendSession = internalAction({
  args: {
    groupId: v.id("groups"),
    sessionId: v.id("sessions"),
    actorId: v.id("users"),
    date: v.string(),
    change: v.union(v.literal("scheduled"), v.literal("cancelled")),
    createdAt: v.number(),
    changedAt: v.number(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const webhook = webhookFor("session");
    if (!webhook) return null;
    const body = await ctx.runQuery(internal.notifications.recipient, args);
    if (!body) return null;
    const { status } = await post(webhook, body);
    if (status >= FIRST_SERVER_ERROR)
      throw new Error(`The session mail webhook answered HTTP ${status}`);
    if (status >= 400) console.error(`The session mail webhook refused: HTTP ${status}, dropped`);
    return null;
  },
});

export function sessionMailConfigured() {
  return webhookFor("session") !== null;
}

async function recordMailVolume(ctx: MutationCtx, count: number) {
  const day = new Date(Date.now()).toISOString().slice(0, 10);
  const volume = await ctx.db
    .query("mailVolume")
    .withIndex("by_day", (q) => q.eq("day", day))
    .unique();
  const before = volume?.count ?? 0;
  const after = before + count;
  if (volume) await ctx.db.patch("mailVolume", volume._id, { count: after });
  else {
    const volumeId = await ctx.db.insert("mailVolume", { day, count: after });
    await ctx.scheduler.runAfter(2 * 86_400_000, internal.mail.expireVolume, { volumeId });
  }
  if ((before < 80 && after >= 80) || (before <= 100 && after > 100)) {
    await serverLog(ctx, "warn", "Session mail daily volume warning", {
      estimated_deliveries: after,
      daily_limit: 100,
      day,
    });
  }
}

export const expireVolume = internalMutation({
  args: { volumeId: v.id("mailVolume") },
  returns: v.null(),
  handler: async (ctx, { volumeId }) => {
    if (await ctx.db.get("mailVolume", volumeId)) await ctx.db.delete("mailVolume", volumeId);
    return null;
  },
});
