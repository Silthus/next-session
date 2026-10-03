import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function deleteAnonymousGm(ctx: MutationCtx, userId: Id<"users">) {
  await deleteAuthAccounts(ctx, userId);
  await deleteAuthSessions(ctx, userId);
  await deleteSaveClaims(ctx, userId);
  await ctx.db.delete("users", userId);
}

async function deleteAuthAccounts(ctx: MutationCtx, userId: Id<"users">) {
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) await ctx.db.delete("authVerificationCodes", code._id);
    await ctx.db.delete("authAccounts", account._id);
  }
}

async function deleteAuthSessions(ctx: MutationCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const session of sessions) {
    const refreshTokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const refreshToken of refreshTokens)
      await ctx.db.delete("authRefreshTokens", refreshToken._id);
    await ctx.db.delete("authSessions", session._id);
  }
}

async function deleteSaveClaims(ctx: MutationCtx, userId: Id<"users">) {
  const claims = await ctx.db
    .query("saveClaims")
    .withIndex("by_anonymousUserId", (q) => q.eq("anonymousUserId", userId))
    .collect();
  for (const claim of claims) await ctx.db.delete("saveClaims", claim._id);
}
