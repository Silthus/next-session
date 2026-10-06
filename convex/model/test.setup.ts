/// <reference types="vite/client" />
import actionRetrierTest from "@convex-dev/action-retrier/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import type { AppErrorData, ErrorCode } from "./errors";
import { rateLimiter } from "./rateLimits";

const modules = import.meta.glob("../**/*.*s");

export type TestBackend = ReturnType<typeof newBackend>;

export function newBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  actionRetrierTest.register(t);
  return t;
}

type UserFields = Omit<Doc<"users">, "_id" | "_creationTime">;

export async function signIn(t: TestBackend, user: UserFields) {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", user);
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 86_400_000,
    });
    return { userId, sessionId };
  });
  return { userId, sessionId, as: t.withIdentity({ subject: `${userId}|${sessionId}` }) };
}

export type GmClient = Awaited<ReturnType<typeof signIn>>["as"];

export const signInAnonymousGm = (t: TestBackend) => signIn(t, { isAnonymous: true });

let accountCount = 0;

export const signInAccount = (t: TestBackend) =>
  signIn(t, { email: `gm-${++accountCount}@example.com` });

export async function signedInGmWithGroup(t: TestBackend, signInGm = signInAccount) {
  const gm = await signInGm(t);
  const groupId = await gm.as.mutation(api.groups.create, {});
  return { ...gm, groupId };
}

export async function seedSession(t: TestBackend, groupId: Id<"groups">, date: string) {
  return await t.run(async (ctx) => await ctx.db.insert("sessions", { groupId, date }));
}

export async function expiryOf(t: TestBackend, groupId: Id<"groups">) {
  return await t.run(async (ctx) => (await ctx.db.get("groups", groupId))?.expiresAt);
}

const MOST_EDITS_TO_SPEND = 1_000;

export async function spendGmEdits(t: TestBackend, gmId: Id<"users">) {
  await t.run(async (ctx) => {
    for (let edit = 0; edit < MOST_EDITS_TO_SPEND; edit++) {
      if (!(await rateLimiter.limit(ctx, "gmEdit", { key: gmId })).ok) return;
    }
    throw new Error("The GM edit limit never refused an edit");
  });
}

export async function expectErrorCode<Code extends ErrorCode>(
  promise: Promise<unknown>,
  code: Code,
) {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ConvexError);
  const { data } = error as ConvexError<AppErrorData & { code: Code }>;
  expect(data.code).toBe(code);
  return data;
}
