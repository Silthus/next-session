import { ConvexError } from "convex/values";
import type { ErrorCode } from "../../../../convex/model/errors";

const messages: Partial<Record<ErrorCode, string>> = {
  SESSION_EXISTS: "That night is already scheduled.",
  OUT_OF_WINDOW: "That date can't change anymore.",
  NOT_FOUND: "That Session is gone already.",
  RATE_LIMITED: "Too many changes at once. Try again in a moment.",
};

const fallback = "That didn't work. Try again.";

export function sessionErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  return (code && messages[code]) ?? fallback;
}

function errorCodeOf(error: unknown): ErrorCode | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return null;
  return data.code as ErrorCode;
}
