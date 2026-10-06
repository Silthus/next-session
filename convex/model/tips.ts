import { TIPS_CONFIRM_PARAM, TIPS_CONSENT_VERSION, TIPS_REQUESTED } from "../../shared/tips";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requestMail } from "../mail";
import { hashSecretCode, newSecretCode } from "./codes";
import { enforceRateLimit } from "./rateLimits";
import { track } from "./telemetry";

declare const process: { env: Record<string, string | undefined> };

const CONFIRMATION_WINDOW_MS = 3 * 86_400_000;

export function tipsConsentFrom(params: { flow?: unknown; tips?: unknown }) {
  if (params.flow !== "signUp" || params.tips !== TIPS_REQUESTED) return {};
  return { tipsRequestedAt: Date.now(), tipsConsentVersion: TIPS_CONSENT_VERSION };
}

export async function tipsConfirmUrlFor(ctx: MutationCtx, account: Doc<"users">) {
  if (account.tipsRequestedAt === undefined) return undefined;
  const code = newSecretCode();
  await ctx.db.patch("users", account._id, { tipsCodeHash: await hashSecretCode(code) });
  const url = new URL("/tips", process.env.SITE_URL);
  url.searchParams.set(TIPS_CONFIRM_PARAM, code);
  return url.toString();
}

export async function confirmTipsWith(ctx: MutationCtx, code: string) {
  await enforceRateLimit(ctx, "confirmTips");
  const account = await accountAwaitingConfirmation(ctx, code);
  if (account === null) return false;
  await ctx.db.patch("users", account._id, {
    tipsConfirmedAt: Date.now(),
    tipsCodeHash: undefined,
  });
  await track(ctx, { name: "tips_confirmed", actor: account });
  await requestMail(ctx, { kind: "tips", user: account });
  return true;
}

async function accountAwaitingConfirmation(ctx: MutationCtx, code: string) {
  const tipsCodeHash = await hashSecretCode(code);
  const account = await ctx.db
    .query("users")
    .withIndex("by_tipsCodeHash", (q) => q.eq("tipsCodeHash", tipsCodeHash))
    .unique();
  const requestedAt = account?.tipsRequestedAt;
  if (requestedAt === undefined || Date.now() >= requestedAt + CONFIRMATION_WINDOW_MS) return null;
  return account;
}
