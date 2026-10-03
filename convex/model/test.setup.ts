/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import type { AppErrorData, ErrorCode } from "./errors";

const modules = import.meta.glob("../**/*.*s");

export type TestBackend = ReturnType<typeof newBackend>;

export function newBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
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

export const signInAccount = (t: TestBackend) => signIn(t, { email: "gm@example.com" });

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
