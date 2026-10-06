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

export const signInThroughAuth = (t: TestBackend, args: SignInArgs) =>
  signInWithTokens(t, () => t.action(api.auth.signIn, args));

async function signInWithTokens(
  t: TestBackend,
  signIn: () => Promise<{ tokens?: { token: string } | null }>,
) {
  const result = await signIn();
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

export const GOOGLE_CLIENT_ID = "next-session-test.apps.googleusercontent.com";

export function withGoogleCredentials() {
  beforeAll(() => {
    vi.stubEnv("AUTH_GOOGLE_ID", GOOGLE_CLIENT_ID);
    vi.stubEnv("AUTH_GOOGLE_SECRET", "google-test-secret");
  });
}

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean };

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function base64urlJson(value: object) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function googleIdToken({ sub, email, emailVerified }: GoogleIdentity) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: GOOGLE_ISSUER,
    aud: GOOGLE_CLIENT_ID,
    sub,
    email,
    email_verified: emailVerified,
    iat: now,
    exp: now + 3600,
  };
  return `${base64urlJson({ alg: "RS256", typ: "JWT" })}.${base64urlJson(claims)}.signature`;
}

function fakeGoogle(identity: GoogleIdentity) {
  return async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === `${GOOGLE_ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        issuer: GOOGLE_ISSUER,
        authorization_endpoint: `${GOOGLE_ISSUER}/o/oauth2/v2/auth`,
        token_endpoint: GOOGLE_TOKEN_ENDPOINT,
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url === GOOGLE_TOKEN_ENDPOINT) {
      return Response.json({
        access_token: "google-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: googleIdToken(identity),
      });
    }
    throw new Error(`The fake Google does not answer ${url}`);
  };
}

function cookiesFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export async function signInWithGoogle(
  t: TestBackend,
  identity: GoogleIdentity,
  { from = t, redirectTo = "/" }: { from?: Pick<TestBackend, "action">; redirectTo?: string } = {},
) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", fakeGoogle(identity));
  try {
    const started = await from.action(api.auth.signIn, {
      provider: "google",
      params: { redirectTo },
    });
    const toGoogle = await t.fetch(new URL(started.redirect!).pathname + new URL(started.redirect!).search, {
      redirect: "manual",
    });
    const fromGoogle = await t.fetch("/api/auth/callback/google?code=google-auth-code", {
      headers: { Cookie: cookiesFrom(toGoogle) },
      redirect: "manual",
    });
    const backToApp = new URL(fromGoogle.headers.get("Location")!);
    const code = backToApp.searchParams.get("code");
    expect(code, `Google sign-in must come back with a code, came back to ${backToApp}`).toBeTypeOf(
      "string",
    );
    const signedIn = await signInWithTokens(t, () =>
      t.action(api.auth.signIn, { params: { code }, verifier: started.verifier }),
    );
    return { ...signedIn, backToApp };
  } finally {
    vi.stubGlobal("fetch", realFetch);
  }
}
