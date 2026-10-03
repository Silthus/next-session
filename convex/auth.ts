import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { LEGAL_VERSIONS } from "../shared/legal";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { insertGroup } from "./model/groups";
import { enforceRateLimit } from "./model/rateLimits";

const ANONYMOUS = "anonymous";

function legalAcceptance() {
  return {
    acceptedTermsVersion: LEGAL_VERSIONS.terms,
    acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
    acceptedLegalAt: Date.now(),
  };
}

const Anonymous = ConvexCredentials<DataModel>({
  id: ANONYMOUS,
  authorize: async (_params, ctx) => {
    await ctx.runMutation(internal.auth.admitAnonymousSignUp, {});
    const { user } = await createAccount<DataModel>(ctx, {
      provider: ANONYMOUS,
      account: { id: crypto.randomUUID() },
      profile: { isAnonymous: true, ...legalAcceptance() },
    });
    return { userId: user._id };
  },
});

const AccountPassword = Password<DataModel>({
  profile: (params) => ({
    email: normalizeEmail(params.email),
    ...(params.flow === "signUp" ? legalAcceptance() : {}),
  }),
});

function normalizeEmail(email: unknown) {
  if (typeof email !== "string" || email.trim() === "") throw new Error("Missing email");
  return email.trim().toLowerCase();
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, AccountPassword],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId, provider }) {
      if (existingUserId !== null || provider.id !== ANONYMOUS) return;
      const gmCtx = ctx as unknown as MutationCtx;
      const gm = await gmCtx.db.get("users", userId);
      if (gm !== null) await insertGroup(gmCtx, gm);
    },
  },
});

export const admitAnonymousSignUp = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "anonymousSignUp");
    return null;
  },
});
