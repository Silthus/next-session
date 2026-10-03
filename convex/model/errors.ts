import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";

export type ErrorCode =
  | "NOT_FOUND"
  | "INVALID_NAME"
  | "NAME_TAKEN"
  | "ROSTER_FULL"
  | "TOO_MANY_GROUPS"
  | "OUT_OF_WINDOW"
  | "SESSION_EXISTS"
  | "UNDO_EXPIRED"
  | "CLAIM_INVALID"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "WEAK_PASSWORD";

export type AppErrorData =
  | { code: "RATE_LIMITED"; retryAfter: number }
  | { code: "NAME_TAKEN"; playerId: Id<"players"> }
  | { code: Exclude<ErrorCode, "RATE_LIMITED" | "NAME_TAKEN"> };

export function fail(data: AppErrorData): never {
  throw new ConvexError(data);
}
