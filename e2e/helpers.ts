import type { Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Answer } from "../shared/answers";

export const convexUrl = process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3210";
export const password = "game-night-2026";

const authStorageSuffix = convexUrl.replace(/[^a-zA-Z0-9]/g, "");

type Tokens = { token: string; refreshToken: string };
export type Gm = {
  tokens: Tokens;
  client: ConvexHttpClient;
  groupId: Id<"groups">;
  shareToken: string;
};

export function newEmail() {
  return `gm-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}@example.test`;
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

export async function signUpAccountWithGroup() {
  const email = newEmail();
  const client = new ConvexHttpClient(convexUrl);
  const { tokens } = await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
  if (!tokens) throw new Error("The sign-up returned no tokens");
  client.setAuth(tokens.token);
  await client.mutation(api.groups.create, {});
  return { email, client };
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

export async function openAsGm(page: Page, gm: Gm, path: string) {
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
