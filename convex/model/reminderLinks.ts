import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { newSecretCode } from "./codes";
import { fail } from "./errors";
import { enforceRateLimit } from "./rateLimits";

const REMINDER_LINK_TOKEN_BYTES = 16;

export async function reminderLinkTokenFor(ctx: MutationCtx, account: Doc<"users">) {
  if (account.reminderLinkToken !== undefined) return account.reminderLinkToken;
  const reminderLinkToken = newSecretCode(REMINDER_LINK_TOKEN_BYTES);
  await ctx.db.patch("users", account._id, { reminderLinkToken });
  return reminderLinkToken;
}

export function remindersOn(account: Doc<"users">) {
  return account.remindersEnabled !== false;
}

export async function accountWithReminderLink(ctx: QueryCtx, token: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_reminderLinkToken", (q) => q.eq("reminderLinkToken", token))
    .unique();
}

export async function switchRemindersWith(ctx: MutationCtx, token: string, enabled: boolean) {
  const account = await accountWithReminderLink(ctx, token);
  if (account === null) fail({ code: "NOT_FOUND" });
  await enforceRateLimit(ctx, "reminderLink", token);
  await ctx.db.patch("users", account._id, { remindersEnabled: enabled });
  return null;
}
