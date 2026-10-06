import {
  ConvexCredentials,
  type ConvexCredentialsUserConfig,
} from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { HOUR } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { LEGAL_VERSIONS } from "../shared/legal";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { fail } from "./model/errors";
import { insertGroup } from "./model/groups";
import { enforceRateLimit } from "./model/rateLimits";
import { requestMail } from "./mail";
import { track } from "./model/telemetry";
import { tipsConfirmUrlFor, tipsConsentFrom } from "./model/tips";

const ANONYMOUS = "anonymous";
const DAY = 86_400_000;
const SESSION_DAYS = 365;
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
      ...tipsConsentFrom(params),
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

const GOOGLE = "google";

const AccountGoogle = Google({
  allowDangerousEmailAccountLinking: false,
  profile: (google) => ({ id: google.sub, email: normalizeEmail(google.email) }),
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
  if (typeof email !== "string" || email.trim() === "") fail({ code: "INVALID_CREDENTIALS" });
  return email.trim().toLowerCase();
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, AccountPassword, AccountGoogle],
  session: {
    totalDurationMs: SESSION_DAYS * DAY,
    inactiveDurationMs: SESSION_DAYS * DAY,
  },
  signIn: { maxFailedAttempsPerHour: MAX_FAILED_SIGN_INS_PER_HOUR },
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId, provider }) {
      if (existingUserId !== null) return;
      const gmCtx = ctx as unknown as MutationCtx;
      if (provider.id === ANONYMOUS) await insertFirstGroup(gmCtx, userId);
      if (provider.id === GOOGLE) await gmCtx.db.patch("users", userId, legalAcceptance());
      if (provider.id === PASSWORD || provider.id === GOOGLE) {
        await welcomeNewAccount(gmCtx, userId, provider.id);
      }
    },
  },
});

async function insertFirstGroup(ctx: MutationCtx, userId: Id<"users">) {
  const gm = await ctx.db.get("users", userId);
  if (gm === null) return;
  const groupId = await insertGroup(ctx, gm);
  await track(ctx, { name: "link_created", actor: gm, group_id: groupId });
}

async function welcomeNewAccount(
  ctx: MutationCtx,
  userId: Id<"users">,
  method: typeof PASSWORD | typeof GOOGLE,
) {
  const account = await ctx.db.get("users", userId);
  if (account === null) return;
  const tips_requested = account.tipsRequestedAt !== undefined;
  await track(ctx, { name: "account_created", actor: account, method, tips_requested });
  const tipsConfirmUrl = await tipsConfirmUrlFor(ctx, account);
  await requestMail(ctx, { kind: "welcome", user: account, tipsConfirmUrl });
}

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
