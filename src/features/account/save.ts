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
  isAccount: boolean;
};

const FLOWS = { create: "signUp", logIn: "signIn" } as const;

const NOTHING_MOVED: SaveResult = { groupIds: [] };

export async function saveGroups(input: SaveInput, deps: SaveDeps) {
  if (deps.isAccount) return await finishSaveAsAccount(deps);
  return await saveAnonymousGroups(input, deps);
}

async function finishSaveAsAccount(deps: SaveDeps) {
  const code = deps.storage.getItem(PENDING_SAVE_KEY);
  if (code === null) return NOTHING_MOVED;
  return await redeem(code, deps);
}

async function saveAnonymousGroups({ email, password, mode }: SaveInput, deps: SaveDeps) {
  const { code } = await deps.startSave();
  deps.storage.setItem(PENDING_SAVE_KEY, code);
  await deps.signIn("password", { email, password, flow: FLOWS[mode] });
  return await redeem(code, deps);
}

export async function resumePendingSave(deps: Pick<SaveDeps, "finishSave" | "storage">) {
  const code = deps.storage.getItem(PENDING_SAVE_KEY);
  if (code === null) return null;
  return await redeem(code, deps).catch(() => null);
}

const redemptions = new Map<string, Promise<SaveResult>>();

function redeem(code: string, deps: Pick<SaveDeps, "finishSave" | "storage">) {
  const inFlight =
    redemptions.get(code) ?? redeemOnce(code, deps).finally(() => redemptions.delete(code));
  redemptions.set(code, inFlight);
  return inFlight;
}

async function redeemOnce(
  code: string,
  { finishSave, storage }: Pick<SaveDeps, "finishSave" | "storage">,
) {
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

function isClaimInvalid(error: unknown) {
  return (
    error instanceof ConvexError && (error.data as { code?: unknown }).code === "CLAIM_INVALID"
  );
}
