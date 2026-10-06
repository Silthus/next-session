import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIPS_CONSENT_VERSION } from "../shared/tips";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createYourLink,
  logInAccount,
  newCredentials,
  signInWithGoogle,
  signUpAccount,
  withAuthKeys,
  withGoogleCredentials,
} from "./auth.test.setup";
import { hashSecretCode } from "./model/codes";
import { rateLimiter } from "./model/rateLimits";
import { expectErrorCode, newBackend, type TestBackend } from "./model/test.setup";

withAuthKeys();
withGoogleCredentials();

const NOW = Date.UTC(2026, 9, 6, 15, 0);
const MINUTE = 60_000;
const DAY = 86_400_000;
const WELCOME_URL = "https://webhooks.example.test/welcome";
const TIPS_URL = "https://webhooks.example.test/tips";
const SITE_URL = "http://localhost:5173";

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "mail-webhook-secret");
  vi.stubEnv("POSTHOG_WELCOME_WEBHOOK_URL", WELCOME_URL);
  vi.stubEnv("POSTHOG_TIPS_WEBHOOK_URL", TIPS_URL);
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type WebhookBody = { distinct_id: string; email: string; tips_confirm_url?: string };

async function mailRequestsDuring(action: () => Promise<unknown>) {
  fetchMock.mockClear();
  await action();
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  return fetchMock.mock.calls.map(([url, init]) => ({
    url,
    body: JSON.parse(init?.body as string) as WebhookBody,
  }));
}

const signUpWithTips = (tips: unknown, credentials = newCredentials()) =>
  signUpAccount(t, credentials, { tips });

async function accountOf(userId: Id<"users">) {
  return (await t.run(async (ctx) => await ctx.db.get("users", userId)))!;
}

async function signUpAskingForTips() {
  let userId: Id<"users"> | undefined;
  const [welcome] = await mailRequestsDuring(async () => {
    ({ userId } = await signUpWithTips("yes"));
  });
  const code = new URL(welcome!.body.tips_confirm_url!).searchParams.get("code")!;
  return { userId: userId!, code };
}

const confirmTips = (code: string) => t.mutation(api.account.confirmTips, { code });

describe("the Welcome Mail", () => {
  it("is requested for a new Password Account, to its own address", async () => {
    const credentials = newCredentials();
    let userId: Id<"users"> | undefined;

    const requests = await mailRequestsDuring(async () => {
      ({ userId } = await signUpAccount(t, credentials));
    });

    expect(requests).toEqual([
      {
        url: WELCOME_URL,
        body: {
          distinct_id: `next-session:${userId}`,
          product: "next-session",
          email: credentials.email,
        },
      },
    ]);
  });

  it("is requested for a new Google Account, without a Tips link", async () => {
    const requests = await mailRequestsDuring(() =>
      signInWithGoogle(t, { sub: "google-sub-welcome", email: "ada@example.com" }),
    );

    expect(requests).toEqual([
      { url: WELCOME_URL, body: expect.objectContaining({ email: "ada@example.com" }) as unknown },
    ]);
    expect(requests[0]!.body).not.toHaveProperty("tips_confirm_url");
  });

  it("is requested once: a log in or a second Google sign-in requests nothing", async () => {
    const credentials = newCredentials();
    const identity = { sub: "google-sub-again", email: "bea@example.com" };
    await mailRequestsDuring(async () => {
      await signUpAccount(t, credentials);
      await signInWithGoogle(t, identity);
    });

    const requests = await mailRequestsDuring(async () => {
      await logInAccount(t, credentials);
      await signInWithGoogle(t, identity);
    });

    expect(requests).toEqual([]);
  });

  it("is not requested for an Anonymous GM", async () => {
    expect(await mailRequestsDuring(() => createYourLink(t))).toEqual([]);
  });
});

describe("asking for Tips at sign-up", () => {
  it("records the consent and its wording's version on the Account", async () => {
    const { userId } = await signUpAskingForTips();

    expect(await accountOf(userId)).toMatchObject({
      tipsRequestedAt: NOW,
      tipsConsentVersion: TIPS_CONSENT_VERSION,
    });
  });

  it("puts a confirmation link into the Welcome Mail and keeps only its code's hash", async () => {
    const { userId, code } = await signUpAskingForTips();

    expect(code).toMatch(/^[\w-]{43}$/);
    const account = await accountOf(userId);
    expect(account.tipsCodeHash).toBe(await hashSecretCode(code));
    expect(JSON.stringify(account)).not.toContain(code);
  });

  it("links the confirmation to the app's /tips page", async () => {
    const [welcome] = await mailRequestsDuring(() => signUpWithTips("yes"));

    expect(welcome!.body.tips_confirm_url).toMatch(new RegExp(`^${SITE_URL}/tips\\?code=`));
  });

  it("gives every Account its own code", async () => {
    const first = await signUpAskingForTips();
    const second = await signUpAskingForTips();

    expect(first.code).not.toBe(second.code);
  });

  it.each([undefined, "no", "true", true])(
    "records nothing for tips: %s and sends a Welcome Mail without the link",
    async (tips) => {
      let userId: Id<"users"> | undefined;
      const [welcome] = await mailRequestsDuring(async () => {
        ({ userId } = await signUpWithTips(tips));
      });

      const account = await accountOf(userId!);
      expect(account).not.toHaveProperty("tipsRequestedAt");
      expect(account).not.toHaveProperty("tipsConsentVersion");
      expect(account).not.toHaveProperty("tipsCodeHash");
      expect(welcome!.body).not.toHaveProperty("tips_confirm_url");
    },
  );

  it("records nothing when a log in carries tips", async () => {
    const credentials = newCredentials();
    const { userId } = await signUpAccount(t, credentials);

    await logInAccount(t, credentials, { tips: "yes" });

    expect(await accountOf(userId)).not.toHaveProperty("tipsRequestedAt");
  });
});

describe("account.confirmTips", () => {
  it("confirms with the code from the Welcome Mail, without a session", async () => {
    const { userId, code } = await signUpAskingForTips();
    vi.setSystemTime(NOW + DAY);

    expect(await confirmTips(code)).toEqual({ confirmed: true });

    const account = await accountOf(userId);
    expect(account.tipsConfirmedAt).toBe(NOW + DAY);
    expect(account).not.toHaveProperty("tipsCodeHash");
  });

  it("requests the Tips mail for the confirmed Account", async () => {
    const { userId, code } = await signUpAskingForTips();

    const requests = await mailRequestsDuring(() => confirmTips(code));

    expect(requests).toEqual([
      {
        url: TIPS_URL,
        body: {
          distinct_id: `next-session:${userId}`,
          product: "next-session",
          email: expect.any(String) as unknown,
        },
      },
    ]);
  });

  it("confirms a minute before the 3 days are up", async () => {
    const { code } = await signUpAskingForTips();
    vi.setSystemTime(NOW + 3 * DAY - MINUTE);

    expect(await confirmTips(code)).toEqual({ confirmed: true });
  });

  it("refuses a late code and requests nothing", async () => {
    const { userId, code } = await signUpAskingForTips();
    vi.setSystemTime(NOW + 3 * DAY);

    const requests = await mailRequestsDuring(async () => {
      expect(await confirmTips(code)).toEqual({ confirmed: false });
    });

    expect(requests).toEqual([]);
    expect(await accountOf(userId)).not.toHaveProperty("tipsConfirmedAt");
  });

  it("refuses a used code and requests nothing more", async () => {
    const { userId, code } = await signUpAskingForTips();
    await mailRequestsDuring(() => confirmTips(code));
    const { tipsConfirmedAt } = await accountOf(userId);
    vi.setSystemTime(NOW + MINUTE);

    const requests = await mailRequestsDuring(async () => {
      expect(await confirmTips(code)).toEqual({ confirmed: false });
    });

    expect(requests).toEqual([]);
    expect((await accountOf(userId)).tipsConfirmedAt).toBe(tipsConfirmedAt);
  });

  it.each(["", "not-a-code", "A".repeat(43)])(
    "refuses the unknown code %j and requests nothing",
    async (code) => {
      await signUpAskingForTips();

      const requests = await mailRequestsDuring(async () => {
        expect(await confirmTips(code)).toEqual({ confirmed: false });
      });

      expect(requests).toEqual([]);
    },
  );

  it("refuses with RATE_LIMITED once the global burst of 60 is spent", async () => {
    const { userId, code } = await signUpAskingForTips();
    await t.run(async (ctx) => {
      for (let guess = 0; guess < 60; guess++) await rateLimiter.limit(ctx, "confirmTips");
    });

    await expectErrorCode(confirmTips(code), "RATE_LIMITED");
    expect(await accountOf(userId)).not.toHaveProperty("tipsConfirmedAt");
  });
});
