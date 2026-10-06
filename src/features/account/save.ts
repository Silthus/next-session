import { ConvexError } from "convex/values";
import type { Id } from "../../../convex/_generated/dataModel";

export const PENDING_SAVE_KEY = "next-session.pendingSave";

export type SaveMode = "create" | "logIn";

export type SaveInput = { email: string; password: string; mode: SaveMode };

type SaveResult = { groupIds: Id<"groups">[] };

export type SaveDeps = {
  startSave: () => Promise<{ code: string }>;
  signIn: (
    provider: "password",
    params: { email: string; password: string; flow: "signUp" | "signIn" },
  ) => Promise<unknown>;
  finishSave: (args: { code: string }) => Promise<SaveResult>;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
};

export type ClaimDeps = Pick<SaveDeps, "finishSave" | "storage">;

export type GoogleSaveDeps = Pick<SaveDeps, "startSave" | "storage"> & {
  continueWithGoogle: () => Promise<unknown>;
};

export const PASSWORD_FLOWS = { create: "signUp", logIn: "signIn" } as const;

export async function saveGroups({ email, password, mode }: SaveInput, deps: SaveDeps) {
  const { code } = await deps.startSave();
  deps.storage.setItem(PENDING_SAVE_KEY, code);
  await deps.signIn("password", { email, password, flow: PASSWORD_FLOWS[mode] });
  return await redeem(code, deps);
}

export async function saveThroughGoogle({
  startSave,
  storage,
  continueWithGoogle,
}: GoogleSaveDeps) {
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
  return await redeem(code, deps);
}

const redemptions = new Map<string, Promise<SaveResult>>();

function redeem(code: string, deps: ClaimDeps) {
  const inFlight =
    redemptions.get(code) ?? redeemOnce(code, deps).finally(() => redemptions.delete(code));
  redemptions.set(code, inFlight);
  return inFlight;
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
