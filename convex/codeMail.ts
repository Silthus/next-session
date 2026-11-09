"use node";

// posthog-node resolves to its Node entry under Convex's bundler, so its sends run in the Node runtime.
import { PostHog, type EmailError, type SendCodeEmailOptions } from "posthog-node";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { codeMailConfig, reminderSend, type CodeMailConfig } from "./mail";
import { reminderMailCopy, welcomeMailCopy } from "./model/accountMailCopy";
import type { MailCopy } from "./model/mailHtml";
import { siteLink } from "./model/siteLinks";

const POSTHOG_HOST = "https://eu.i.posthog.com";
const WELCOME_SENDER = "Michael from Next Session <hello@next-session.link>";
const REMINDER_SENDER = "Next Session <hello@next-session.link>";

export const sendWelcome = internalAction({
  args: {
    userId: v.id("users"),
    to: v.string(),
    distinctId: v.string(),
    tipsConfirmUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, { userId, to, distinctId, tipsConfirmUrl }) => {
    const copy = welcomeMailCopy({ myGroupsLink: siteLink("/me"), tipsConfirmUrl });
    await send("Welcome Mail", copy, {
      to,
      distinctId,
      from: WELCOME_SENDER,
      templateKey: "next-session-welcome",
      idempotencyKey: `next-session:welcome:${userId}`,
    });
    return null;
  },
});

export const sendReminder = internalAction({
  args: reminderSend,
  returns: v.null(),
  handler: async (ctx, reminder) => {
    const body = await ctx.runQuery(internal.reminders.recipient, reminder);
    if (body === null) return null;
    const copy = reminderMailCopy({
      lead: body.lead,
      groupName: body.group_name,
      dateLabel: body.date_label,
      startLabel: body.start_label,
      location: body.location,
      playerUrl: body.player_url,
      remindersOffUrl: body.reminders_off_url,
    });
    const { sessionId, revision, lead, userId } = reminder;
    await send("Reminder", copy, {
      to: body.email,
      distinctId: body.distinct_id,
      from: REMINDER_SENDER,
      templateKey: "next-session-reminder",
      idempotencyKey: `next-session:reminder:${sessionId}:${revision}:${lead}:${userId}`,
    });
    return null;
  },
});

type Envelope = Pick<
  SendCodeEmailOptions,
  "to" | "distinctId" | "from" | "templateKey" | "idempotencyKey"
>;

async function send(name: string, copy: MailCopy, envelope: Envelope) {
  const config = codeMailConfig();
  if (config === null) {
    console.error(`Code mail is no longer configured, the ${name} was dropped`);
    return;
  }
  const { error } = await clientFor(config).emails.send({
    ...envelope,
    ...copy,
    replyTo: config.replyTo,
    captureEngagement: false,
  });
  if (error === null) return;
  if (isRetryable(error)) throw new Error(`PostHog didn't take the ${name}: ${error.code}`);
  console.error(`PostHog refused the ${name}: ${error.code}, dropped`);
}

function clientFor({ projectToken, secretKey }: CodeMailConfig) {
  return new PostHog(projectToken, {
    host: POSTHOG_HOST,
    secretKey,
    enableLocalEvaluation: false,
    fetch: (url, options) => fetch(url, options),
  });
}

// What posthog-node retries itself. Its retries share the idempotency key, and so do the retrier's.
function isRetryable({ statusCode, code }: EmailError) {
  if (statusCode === undefined) return code === "network_error";
  if (statusCode === 409) return code === "idempotency_key_in_flight";
  if (statusCode === 429) return code !== "quota_limited";
  return statusCode >= 500;
}
