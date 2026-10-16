import { expect, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Answer } from "../shared/answers";
import { monthOf, type IsoDate } from "../shared/dates";

export const convexUrl = process.env.E2E_CONVEX_URL!;
export const password = "game-night-2026";

type Tokens = { token: string; refreshToken: string };
export type Gm = {
  tokens: Tokens;
  client: ConvexHttpClient;
  groupId: Id<"groups">;
  shareToken: string;
};

export async function reserveAccountSignUp() {
  await refillAccountSignUpBudget();
  return `gm-${crypto.randomUUID()}@example.test`;
}

async function refillAccountSignUpBudget() {
  const response = await fetch(`${convexUrl}/api/function`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${localBackendAdminKey()}`,
    },
    body: JSON.stringify({
      componentPath: "rateLimiter",
      path: "lib:resetRateLimit",
      format: "json",
      args: { name: "accountSignUp" },
    }),
  });
  const result = (await response.json()) as { status: string; errorMessage?: string };
  if (result.status !== "success") {
    throw new Error(`Refilling the sign-up budget failed: ${result.errorMessage}`);
  }
}

function localBackendAdminKey() {
  const config = join(process.cwd(), ".convex", "local", "default", "config.json");
  return (JSON.parse(readFileSync(config, "utf8")) as { adminKey: string }).adminKey;
}

export async function signInAnonymousGm(): Promise<Gm> {
  const client = new ConvexHttpClient(convexUrl);
  const { tokens } = await client.action(api.auth.signIn, { provider: "anonymous" });
  if (!tokens) throw new Error("The anonymous sign-in returned no tokens");
  client.setAuth(tokens.token);
  const [group] = await client.query(api.groups.mine, {});
  if (!group) throw new Error("The anonymous sign-in made no Group");
  return { tokens, client, groupId: group.id, shareToken: await shareTokenOf(client, group.id) };
}

export async function signUpAccount() {
  const email = await reserveAccountSignUp();
  const client = new ConvexHttpClient(convexUrl);
  const { tokens } = await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
  if (!tokens) throw new Error("The sign-up returned no tokens");
  client.setAuth(tokens.token);
  return { email, client, tokens };
}

export async function signUpAccountWithGroup() {
  const account = await signUpAccount();
  await account.client.mutation(api.groups.create, {});
  return account;
}

export async function shareTokenOf(client: ConvexHttpClient, groupId: Id<"groups">) {
  const view = await client.query(api.groups.get, { groupId });
  if (!view) throw new Error("The GM cannot read their Group");
  return view.shareToken;
}

export async function seedPlayer(gm: Gm, name: string, answers: Record<string, Answer> = {}) {
  const visitor = new ConvexHttpClient(convexUrl);
  const playerId = await visitor.mutation(api.player.join, { shareToken: gm.shareToken, name });
  for (const [date, answer] of Object.entries(answers)) {
    await visitor.mutation(api.player.answer, {
      shareToken: gm.shareToken,
      playerId,
      date,
      answer,
    });
  }
}

export async function openAsGm(page: Page, gm: Pick<Gm, "tokens">, path: string) {
  const authStorageSuffix = convexUrl.replace(/[^a-zA-Z0-9]/g, "");
  await page.goto("/terms");
  await page.evaluate(
    ([suffix, tokens]) => {
      localStorage.setItem(`__convexAuthJWT_${suffix}`, tokens.token);
      localStorage.setItem(`__convexAuthRefreshToken_${suffix}`, tokens.refreshToken);
    },
    [authStorageSuffix, gm.tokens] as const,
  );
  await page.goto(path);
}

export function toastRegion(page: Page) {
  return page.locator('[role="status"][aria-live="polite"]');
}

const PUBLISH_WAIT_MS = 60_000;

export async function waitUntilPublished(
  gm: ConvexHttpClient,
  groupId: Id<"groups">,
  date: IsoDate,
) {
  const isPublished = async () => {
    const schedule = await gm.query(api.schedule.month, { groupId, month: monthOf(date) });
    return schedule?.sessions.find((session) => session.date === date)?.published ?? false;
  };
  await expect.poll(isPublished, { timeout: PUBLISH_WAIT_MS }).toBe(true);
}
