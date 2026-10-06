import { ActionRetrier } from "@convex-dev/action-retrier";
import { v, type Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, type MutationCtx } from "./_generated/server";
import { accountDistinctId, isTestAddress, PRODUCT } from "./model/telemetry";

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

const WEBHOOK_URL_VARIABLES: Record<MailKind, string> = {
  welcome: "POSTHOG_WELCOME_WEBHOOK_URL",
  tips: "POSTHOG_TIPS_WEBHOOK_URL",
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

function webhookFor(kind: MailKind) {
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
