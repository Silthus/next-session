import { v } from "convex/values";
import { query } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };

export function isGoogleConfigured() {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export const available = query({
  args: {},
  returns: v.object({ google: v.boolean() }),
  handler: () => ({ google: isGoogleConfigured() }),
});
