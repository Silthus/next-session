import { beforeAll, expect, vi } from "vitest";
import { generateAuthKeys } from "../scripts/authKeys";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { TestBackend } from "./model/test.setup";

export function withAuthKeys() {
  beforeAll(async () => {
    const { jwtPrivateKey, jwks } = await generateAuthKeys();
    vi.stubEnv("JWT_PRIVATE_KEY", jwtPrivateKey);
    vi.stubEnv("JWKS", jwks);
    vi.stubEnv("SITE_URL", "http://localhost:5173");
    vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  });
}

type SignInArgs =
  | { provider: "anonymous" }
  | {
      provider: "password";
      params: { email: string; password: string; flow: "signUp" | "signIn" };
    };

export async function signInThroughAuth(t: TestBackend, args: SignInArgs) {
  const result = await t.action(api.auth.signIn, args);
  const token = result.tokens?.token;
  expect(token, "sign-in must issue a token").toBeTypeOf("string");
  const { sub } = JSON.parse(atob(token!.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
    sub: string;
  };
  const [userId, sessionId] = sub.split("|") as [Id<"users">, Id<"authSessions">];
  return { userId, sessionId, as: t.withIdentity({ subject: sub }) };
}

export const createYourLink = (t: TestBackend) => signInThroughAuth(t, { provider: "anonymous" });

let accountCount = 0;

export function newCredentials() {
  return { email: `account-${++accountCount}@example.com`, password: "correct horse battery" };
}

export const signUpAccount = (t: TestBackend, credentials = newCredentials()) =>
  signInThroughAuth(t, { provider: "password", params: { ...credentials, flow: "signUp" } });

export const logInAccount = (t: TestBackend, credentials: { email: string; password: string }) =>
  signInThroughAuth(t, { provider: "password", params: { ...credentials, flow: "signIn" } });
