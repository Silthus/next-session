import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./errors";

const limits = {
  anonymousSignUp: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 60 },
  createGroup: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  joinGroup: { kind: "fixed window", rate: 30, period: HOUR },
  answer: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
  answerPerGroup: { kind: "token bucket", rate: 600, period: MINUTE, capacity: 300 },
  startSave: { kind: "fixed window", rate: 10, period: HOUR },
} as const;

export const rateLimiter = new RateLimiter(components.rateLimiter, limits);

export type RateLimitName = keyof typeof limits;

export async function enforceRateLimit(ctx: MutationCtx, name: RateLimitName, key?: string) {
  const status = await rateLimiter.limit(ctx, name, { key });
  if (!status.ok) fail({ code: "RATE_LIMITED", retryAfter: status.retryAfter });
}
