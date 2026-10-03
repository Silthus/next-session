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

const FLOWS = { create: "signUp", logIn: "signIn" } as const;

export async function saveGroups({ email, password, mode }: SaveInput, deps: SaveDeps) {
  const { code } = await deps.startSave();
  deps.storage.setItem(PENDING_SAVE_KEY, code);
  try {
    await deps.signIn("password", { email, password, flow: FLOWS[mode] });
  } catch (error) {
    deps.storage.removeItem(PENDING_SAVE_KEY);
    throw error;
  }
  return await redeem(code, deps);
}

export async function resumePendingSave(deps: Pick<SaveDeps, "finishSave" | "storage">) {
  const code = deps.storage.getItem(PENDING_SAVE_KEY);
  if (code === null) return null;
  return await redeem(code, deps).catch(() => null);
}

async function redeem(
  code: string,
  { finishSave, storage }: Pick<SaveDeps, "finishSave" | "storage">,
) {
  try {
    const result = await finishSave({ code });
    storage.removeItem(PENDING_SAVE_KEY);
    return result;
  } catch (error) {
    if (isClaimInvalid(error)) storage.removeItem(PENDING_SAVE_KEY);
    throw error;
  }
}

function isClaimInvalid(error: unknown) {
  return (
    error instanceof ConvexError && (error.data as { code?: unknown }).code === "CLAIM_INVALID"
  );
}
