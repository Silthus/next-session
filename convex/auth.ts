import {
  ConvexCredentials,
  type ConvexCredentialsUserConfig,
} from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { HOUR } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { LEGAL_VERSIONS } from "../shared/legal";
import { UNSAVED_GROUP_QUIET_DAYS } from "../shared/limits";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { fail } from "./model/errors";
import { insertGroup } from "./model/groups";
import { enforceRateLimit } from "./model/rateLimits";

const ANONYMOUS = "anonymous";
const DAY = 86_400_000;
const SESSION_TOTAL_DAYS = 365;
const MAX_FAILED_SIGN_INS_PER_HOUR = 10;
const MIN_PASSWORD_LENGTH = 8;

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

const PASSWORD = "password";

const stockPassword = (
  Password<DataModel>({
    profile: (params) => ({
      email: normalizeEmail(params.email),
      ...(params.flow === "signUp" ? legalAcceptance() : {}),
    }),
  }) as unknown as { options: ConvexCredentialsUserConfig<DataModel> }
).options;

const AccountPassword = ConvexCredentials<DataModel>({
  ...stockPassword,
  authorize: async (params, ctx) => {
    if (params.flow === "signUp") {
      requireStrongPassword(params.password);
      await ctx.runMutation(internal.auth.admitAccountSignUp, {
        email: normalizeEmail(params.email),
      });
    }
    try {
      return await stockPassword.authorize(params, ctx);
    } catch (error) {
      refuseSignIn(error);
    }
  },
});

function requireStrongPassword(password: unknown) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    fail({ code: "WEAK_PASSWORD" });
  }
}

function refuseSignIn(error: unknown): never {
  const reason = error instanceof Error ? error.message : undefined;
  if (reason === "InvalidAccountId" || reason === "InvalidSecret") {
    fail({ code: "INVALID_CREDENTIALS" });
  }
  if (reason === "TooManyFailedAttempts") {
    fail({ code: "RATE_LIMITED", retryAfter: HOUR / MAX_FAILED_SIGN_INS_PER_HOUR });
  }
  throw error;
}

function normalizeEmail(email: unknown) {
  if (typeof email !== "string" || email.trim() === "") throw new Error("Missing email");
  return email.trim().toLowerCase();
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, AccountPassword],
  session: {
    totalDurationMs: SESSION_TOTAL_DAYS * DAY,
    inactiveDurationMs: UNSAVED_GROUP_QUIET_DAYS * DAY,
  },
  signIn: { maxFailedAttempsPerHour: MAX_FAILED_SIGN_INS_PER_HOUR },
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

export const admitAccountSignUp = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", PASSWORD).eq("providerAccountId", email),
      )
      .unique();
    if (account !== null) fail({ code: "EMAIL_TAKEN" });
    await enforceRateLimit(ctx, "accountSignUp");
    return null;
  },
});
