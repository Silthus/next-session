import type { Id } from "../../../convex/_generated/dataModel";
import type { ErrorCode } from "../../../convex/model/errors";
import { appErrorOf } from "../../lib/errors";
import type { KeyValueStorage } from "../../lib/storage";
import { log } from "../../lib/telemetry";

export const PENDING_KEEP_KEY = "next-session.pendingKeep";

export type Keep = { shareToken: string; playerId: Id<"players"> };

export type KeepOutcome = { kept: true } | { kept: false; error: unknown };

export type ResumedKeep = { keep: Keep; outcome: KeepOutcome };

export type KeepDeps = {
  claim: (keep: Keep) => Promise<unknown>;
  storage: KeyValueStorage;
};

const FINAL_REFUSALS: ReadonlySet<ErrorCode> = new Set([
  "PLAYER_CLAIMED",
  "NOT_FOUND",
  "TOO_MANY_GROUPS",
]);

export async function keepGroup(
  keep: Keep,
  signIn: () => Promise<unknown>,
  deps: KeepDeps,
): Promise<KeepOutcome> {
  const remembered = JSON.stringify(keep);
  deps.storage.setItem(PENDING_KEEP_KEY, remembered);
  try {
    await signIn();
  } catch (error) {
    if (appErrorOf(error) !== null) forgetKeep(deps.storage, remembered);
    throw error;
  }
  return await claimRemembered(keep, remembered, deps);
}

export function forgetPendingKeep(storage: KeyValueStorage) {
  storage.removeItem(PENDING_KEEP_KEY);
}

export async function keepAfterRedirect(
  keep: Keep,
  leaveToSignIn: () => Promise<unknown>,
  storage: KeyValueStorage,
) {
  const remembered = JSON.stringify(keep);
  storage.setItem(PENDING_KEEP_KEY, remembered);
  try {
    await leaveToSignIn();
  } catch (error) {
    forgetKeep(storage, remembered);
    throw error;
  }
}

export async function resumePendingKeep(deps: KeepDeps): Promise<ResumedKeep | null> {
  const remembered = deps.storage.getItem(PENDING_KEEP_KEY);
  if (remembered === null) return null;
  const keep = parseKeep(remembered);
  if (keep === null) {
    forgetPendingKeep(deps.storage);
    return null;
  }
  const outcome = await claimRemembered(keep, remembered, deps);
  logResumedKeep(outcome);
  return { keep, outcome };
}

function logResumedKeep(outcome: KeepOutcome) {
  if (outcome.kept) log("info", "Pending keep finished", { outcome: "kept" });
  else
    log("warn", "Pending keep refused", {
      outcome: appErrorOf(outcome.error)?.code ?? "unexpected",
    });
}

async function claimRemembered(
  keep: Keep,
  remembered: string,
  { claim, storage }: KeepDeps,
): Promise<KeepOutcome> {
  try {
    await claim(keep);
    forgetKeep(storage, remembered);
    return { kept: true };
  } catch (error) {
    if (isFinalRefusal(error)) forgetKeep(storage, remembered);
    return { kept: false, error };
  }
}

function isFinalRefusal(error: unknown) {
  const code = appErrorOf(error)?.code;
  return code !== undefined && FINAL_REFUSALS.has(code);
}

function forgetKeep(storage: KeyValueStorage, remembered: string) {
  if (storage.getItem(PENDING_KEEP_KEY) === remembered) storage.removeItem(PENDING_KEEP_KEY);
}

function parseKeep(remembered: string): Keep | null {
  try {
    const value: unknown = JSON.parse(remembered);
    return isKeep(value) ? { shareToken: value.shareToken, playerId: value.playerId } : null;
  } catch {
    return null;
  }
}

function isKeep(value: unknown): value is Keep {
  return (
    typeof value === "object" &&
    value !== null &&
    "shareToken" in value &&
    typeof value.shareToken === "string" &&
    "playerId" in value &&
    typeof value.playerId === "string"
  );
}
