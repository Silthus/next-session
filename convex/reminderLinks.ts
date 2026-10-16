import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { accountWithReminderLink, remindersOn, switchRemindersWith } from "./model/reminderLinks";

export const status = query({
  args: { token: v.string() },
  returns: v.union(v.object({ enabled: v.boolean() }), v.null()),
  handler: async (ctx, { token }) => {
    const account = await accountWithReminderLink(ctx, token);
    return account && { enabled: remindersOn(account) };
  },
});

export const turnOff = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => await switchRemindersWith(ctx, token, false),
});

export const turnOn = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => await switchRemindersWith(ctx, token, true),
});
