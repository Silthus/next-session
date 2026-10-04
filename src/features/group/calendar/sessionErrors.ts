import { ConvexError } from "convex/values";
import type { ErrorCode } from "../../../../convex/model/errors";

const messages = new Map<unknown, string>([
  ["SESSION_EXISTS", "That night is already scheduled."],
  ["OUT_OF_WINDOW", "That date can't change anymore."],
  ["NOT_FOUND", "That session is gone already."],
  ["RATE_LIMITED", "Too many changes at once. Try again in a moment."],
] satisfies [ErrorCode, string][]);

const fallback = "That didn't work. Try again.";

export function sessionErrorMessage(error: unknown): string {
  return messages.get(errorCodeOf(error)) ?? fallback;
}

function errorCodeOf(error: unknown): unknown {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "code" in data ? data.code : null;
}
