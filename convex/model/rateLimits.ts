import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./errors";

const limits = {
  anonymousSignUp: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 60 },
  accountSignUp: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 20 },
  createGroup: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  joinGroup: { kind: "fixed window", rate: 30, period: HOUR },
  answer: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
  answerPerGroup: { kind: "token bucket", rate: 600, period: MINUTE, capacity: 300, shards: 10 },
  startSave: { kind: "fixed window", rate: 10, period: HOUR },
  gmEdit: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
  claimPlayer: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  confirmTips: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 60 },
} as const;

export const rateLimiter = new RateLimiter(components.rateLimiter, limits);

type GlobalRateLimit = "anonymousSignUp" | "accountSignUp" | "confirmTips";
type KeyedRateLimit = Exclude<keyof typeof limits, GlobalRateLimit>;

export async function enforceRateLimit(
  ctx: MutationCtx,
  ...[name, key]: [GlobalRateLimit] | [KeyedRateLimit, string]
) {
  const status = await rateLimiter.limit(ctx, name, { key });
  if (!status.ok) fail({ code: "RATE_LIMITED", retryAfter: status.retryAfter });
}
