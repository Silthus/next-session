import { ConvexError } from "convex/values";
import type { Id } from "../../../convex/_generated/dataModel";
import { TIPS_REQUESTED } from "../../../shared/tips";
import { appErrorOf } from "../../lib/errors";
import { log, track } from "../../lib/telemetry";

export const PENDING_SAVE_KEY = "next-session.pendingSave";

export type SaveMode = "create" | "logIn";

export type SaveInput = { email: string; password: string; mode: SaveMode; tips?: boolean };

type SaveResult = { groupIds: Id<"groups">[] };

export type SaveDeps = {
  startSave: () => Promise<{ code: string }>;
  signIn: (
    provider: "password",
    params: {
      email: string;
      password: string;
      flow: "signUp" | "signIn";
      tips?: typeof TIPS_REQUESTED;
    },
  ) => Promise<unknown>;
  finishSave: (args: { code: string }) => Promise<SaveResult>;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
};

export type ClaimDeps = Pick<SaveDeps, "finishSave" | "storage">;

export type GoogleSaveDeps = Pick<SaveDeps, "startSave" | "storage"> & {
  continueWithGoogle: () => Promise<unknown>;
};

export const PASSWORD_FLOWS = { create: "signUp", logIn: "signIn" } as const;

export async function saveGroups({ email, password, mode, tips }: SaveInput, deps: SaveDeps) {
  track({ name: "save_started" });
  const { code } = await deps.startSave();
  deps.storage.setItem(PENDING_SAVE_KEY, code);
  await deps.signIn("password", {
    email,
    password,
    flow: PASSWORD_FLOWS[mode],
    ...(mode === "create" && tips === true ? { tips: TIPS_REQUESTED } : {}),
  });
  return await redeem(code, deps);
}

export async function saveThroughGoogle({
  startSave,
  storage,
  continueWithGoogle,
}: GoogleSaveDeps) {
  track({ name: "save_started" });
  const { code } = await startSave();
  storage.setItem(PENDING_SAVE_KEY, code);
  await continueWithGoogle();
}

export function hasPendingSave(storage: ClaimDeps["storage"]) {
  return storage.getItem(PENDING_SAVE_KEY) !== null;
}

export async function finishLeftOverSave(deps: ClaimDeps) {
  if (hasPendingSave(deps.storage)) await finishPendingSave(deps);
}

export async function finishPendingSave(deps: ClaimDeps) {
  const code = deps.storage.getItem(PENDING_SAVE_KEY);
  if (code === null) throw new ConvexError({ code: "CLAIM_INVALID" });
  return await redeem(code, deps, logRecovery);
}

const redemptions = new Map<string, Promise<SaveResult>>();

function redeem(
  code: string,
  deps: ClaimDeps,
  observe: (redemption: Promise<SaveResult>) => void = () => undefined,
) {
  const inFlight = redemptions.get(code);
  if (inFlight) return inFlight;
  const redemption = redeemOnce(code, deps).finally(() => redemptions.delete(code));
  redemptions.set(code, redemption);
  observe(redemption);
  return redemption;
}

function logRecovery(redemption: Promise<SaveResult>) {
  redemption.then(
    () => log("info", "Pending save finished", { outcome: "saved" }),
    (error: unknown) =>
      log("warn", "Pending save refused", { outcome: appErrorOf(error)?.code ?? "unexpected" }),
  );
}

async function redeemOnce(code: string, { finishSave, storage }: ClaimDeps) {
  try {
    const result = await finishSave({ code });
    forgetClaim(storage, code);
    return result;
  } catch (error) {
    if (isClaimInvalid(error)) forgetClaim(storage, code);
    throw error;
  }
}

function forgetClaim(storage: SaveDeps["storage"], code: string) {
  if (storage.getItem(PENDING_SAVE_KEY) === code) storage.removeItem(PENDING_SAVE_KEY);
}

export function isClaimInvalid(error: unknown) {
  return (
    error instanceof ConvexError && (error.data as { code?: unknown }).code === "CLAIM_INVALID"
  );
}
