import { ConvexError } from "convex/values";
import type { AppErrorData, ErrorCode } from "../../convex/model/errors";
import { MAX_GROUPS_PER_GM, MAX_PLAYERS_PER_GROUP } from "../../shared/limits";
import { NAME_MAX_LENGTH } from "../../shared/names";

type Copy = Partial<Record<ErrorCode, string>>;

const shared: Copy = {
  RATE_LIMITED: "Slow down a moment, then try again.",
  INVALID_NAME: `Use 1 to ${String(NAME_MAX_LENGTH)} characters.`,
};

const answer: Copy = {
  RATE_LIMITED: "Slow down a moment.",
  OUT_OF_WINDOW: "That night is locked now.",
};

const byTopic = {
  session: {
    SESSION_EXISTS: "That night is already scheduled.",
    OUT_OF_WINDOW: "That date can't change anymore.",
    NOT_FOUND: "That session is gone already.",
  },
  roster: {
    NAME_TAKEN: "That name is already on the list.",
    ROSTER_FULL: `This group is full. It holds ${String(MAX_PLAYERS_PER_GROUP)} players.`,
    NOT_FOUND: "That player is gone already.",
  },
  group: {
    TOO_MANY_GROUPS: `You have ${String(MAX_GROUPS_PER_GM)} groups. Delete one to make room.`,
    NOT_FOUND: "That group is gone already.",
  },
  shareLink: {
    UNDO_EXPIRED: "Too late to undo. Share the new link.",
    NOT_FOUND: "That group is gone already.",
  },
  join: {
    NAME_TAKEN: "That name exists. Tap it, or add a last initial.",
    ROSTER_FULL: "This group is full. Ask your GM to make room.",
    INVALID_NAME: `Use a name of up to ${String(NAME_MAX_LENGTH)} characters.`,
  },
  answer,
  fillRest: { ...answer, OUT_OF_WINDOW: "Those nights are locked now." },
} satisfies Record<string, Copy>;

export type ErrorTopic = keyof typeof byTopic;

const fallback = "That didn't work. Try again.";

const fallbackByTopic: Partial<Record<ErrorTopic, string>> = {
  answer: "That didn't save. Try again.",
  fillRest: "That didn't save. Try again.",
};

export function errorMessage(error: unknown, topic: ErrorTopic): string {
  return appErrorMessage(appErrorOf(error), topic);
}

export function appErrorMessage(error: AppErrorData | null, topic: ErrorTopic): string {
  return error === null ? fallbackFor(topic) : codeMessage(error.code, topic);
}

export function codeMessage(code: ErrorCode, topic: ErrorTopic): string {
  const copy: Copy = { ...shared, ...byTopic[topic] };
  return copy[code] ?? fallbackFor(topic);
}

export function appErrorOf(error: unknown): AppErrorData | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return null;
  return typeof data.code === "string" ? (data as AppErrorData) : null;
}

function fallbackFor(topic: ErrorTopic): string {
  return fallbackByTopic[topic] ?? fallback;
}
