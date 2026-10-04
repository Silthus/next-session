import { ConvexError } from "convex/values";
import type { AppErrorData } from "../../../convex/model/errors";
import { NAME_MAX_LENGTH } from "../../../shared/names";

export function appErrorOf(error: unknown): AppErrorData | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "code" in data
    ? (data as AppErrorData)
    : null;
}

export function joinErrorCopy(error: AppErrorData | null): string {
  switch (error?.code) {
    case "NAME_TAKEN":
      return "That name exists. Tap it, or add a last initial.";
    case "RATE_LIMITED":
      return "Slow down a moment, then try again.";
    case "ROSTER_FULL":
      return "This group is full. Ask your GM to make room.";
    case "INVALID_NAME":
      return `Use a name of up to ${String(NAME_MAX_LENGTH)} characters.`;
    default:
      return "That didn't work. Try again.";
  }
}

export function answerErrorCopy(error: AppErrorData | null): string {
  switch (error?.code) {
    case "RATE_LIMITED":
      return "Slow down a moment.";
    case "OUT_OF_WINDOW":
      return "That night is locked now.";
    default:
      return "That didn't save. Try again.";
  }
}
