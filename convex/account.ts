import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { currentGm, requireAccount, requireGm } from "./model/access";
import { fail } from "./model/errors";
import { hashSecretCode, newSecretCode } from "./model/codes";
import { deleteAnonymousGm } from "./model/gms";
import { ensureRoomForGroups, groupsOwnedBy } from "./model/groups";
import { enforceRateLimit } from "./model/rateLimits";
import { track } from "./model/telemetry";
import { confirmTipsWith } from "./model/tips";

const CLAIM_TTL_MS = 10 * 60_000;

export const me = query({
  args: {},
  returns: v.union(v.object({ isAnonymous: v.boolean(), email: v.optional(v.string()) }), v.null()),
  handler: async (ctx) => {
    const gm = await currentGm(ctx);
    if (gm === null) return null;
    return { isAnonymous: gm.isAnonymous === true, email: gm.email };
  },
});

export const startSave = mutation({
  args: {},
  returns: v.object({ code: v.string() }),
  handler: async (ctx) => {
    const gm = await requireGm(ctx);
    if (gm.isAnonymous !== true) fail({ code: "UNAUTHENTICATED" });
    await enforceRateLimit(ctx, "startSave", gm._id);
    await deleteExpiredClaims(ctx, gm);
    const code = newSecretCode();
    await ctx.db.insert("saveClaims", {
      anonymousUserId: gm._id,
      codeHash: await hashSecretCode(code),
      expiresAt: Date.now() + CLAIM_TTL_MS,
    });
    return { code };
  },
});

export const finishSave = mutation({
  args: { code: v.string() },
  returns: v.object({ groupIds: v.array(v.id("groups")) }),
  handler: async (ctx, { code }) => {
    const account = await requireAccount(ctx);
    const anonymousGm = await redeemClaim(ctx, code);
    await enforceRateLimit(ctx, "gmEdit", account._id);
    const groupIds = await moveGroups(ctx, anonymousGm, account);
    await copyLegalAcceptance(ctx, anonymousGm, account);
    await deleteAnonymousGm(ctx, anonymousGm);
    await track(ctx, { name: "groups_saved", actor: account, group_count: groupIds.length });
    return { groupIds };
  },
});

export const confirmTips = mutation({
  args: { code: v.string() },
  returns: v.object({ confirmed: v.boolean() }),
  handler: async (ctx, { code }) => ({ confirmed: await confirmTipsWith(ctx, code) }),
});

async function deleteExpiredClaims(ctx: MutationCtx, gm: Doc<"users">) {
  const claims = await ctx.db
    .query("saveClaims")
    .withIndex("by_anonymousUserId", (q) => q.eq("anonymousUserId", gm._id))
    .collect();
  for (const claim of claims.filter(({ expiresAt }) => expiresAt <= Date.now())) {
    await ctx.db.delete("saveClaims", claim._id);
  }
}

async function redeemClaim(ctx: MutationCtx, code: string) {
  const codeHash = await hashSecretCode(code);
  const claim = await ctx.db
    .query("saveClaims")
    .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
    .unique();
  const anonymousGm = claim === null ? null : await ctx.db.get("users", claim.anonymousUserId);
  if (claim === null || claim.expiresAt <= Date.now() || anonymousGm?.isAnonymous !== true) {
    fail({ code: "CLAIM_INVALID" });
  }
  return anonymousGm;
}

async function moveGroups(ctx: MutationCtx, from: Doc<"users">, to: Doc<"users">) {
  const groups = await groupsOwnedBy(ctx, from._id);
  await ensureRoomForGroups(ctx, to, groups.length);
  for (const group of groups) {
    await ctx.db.patch("groups", group._id, { ownerId: to._id, expiresAt: undefined });
  }
  return groups.map((group) => group._id);
}

async function copyLegalAcceptance(ctx: MutationCtx, from: Doc<"users">, to: Doc<"users">) {
  if (to.acceptedLegalAt !== undefined) return;
  await ctx.db.patch("users", to._id, {
    acceptedTermsVersion: from.acceptedTermsVersion,
    acceptedPrivacyVersion: from.acceptedPrivacyVersion,
    acceptedLegalAt: from.acceptedLegalAt,
  });
}
