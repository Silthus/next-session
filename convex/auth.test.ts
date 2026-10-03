import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSIONS } from "../shared/legal";
import { UNSAVED_GROUP_QUIET_DAYS } from "../shared/limits";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createYourLink,
  logInAccount,
  newCredentials,
  signUpAccount,
  withAuthKeys,
} from "./auth.test.setup";
import { expectErrorCode, newBackend, type TestBackend } from "./model/test.setup";

withAuthKeys();

let t: TestBackend;

beforeEach(() => {
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;

async function legalAcceptanceOf(userId: Id<"users">) {
  const user = await t.run(async (ctx) => await ctx.db.get("users", userId));
  return {
    terms: user?.acceptedTermsVersion,
    privacy: user?.acceptedPrivacyVersion,
    at: user?.acceptedLegalAt,
  };
}

describe("Create your link", () => {
  it("signs in an Anonymous GM who already holds a Share Link to one Unsaved Group", async () => {
    const { as } = await createYourLink(t);

    const groups = await as.query(api.groups.mine, {});
    expect(groups.map(({ name, playerCount }) => ({ name, playerCount }))).toEqual([
      { name: "My group", playerCount: 0 },
    ]);
    const group = await as.query(api.groups.get, { groupId: groups[0]!.id });
    expect(group?.shareToken).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(group?.expiresAt).toBeGreaterThan(Date.now() + (UNSAVED_GROUP_QUIET_DAYS - 1) * DAY);
    expect(await as.query(api.account.me, {})).toEqual({ isAnonymous: true });
  });

  it("records the Legal Acceptance with the click", async () => {
    const before = Date.now();
    const { userId } = await createYourLink(t);

    const acceptance = await legalAcceptanceOf(userId);
    expect(acceptance).toMatchObject({
      terms: LEGAL_VERSIONS.terms,
      privacy: LEGAL_VERSIONS.privacy,
    });
    expect(acceptance.at).toBeGreaterThanOrEqual(before);
  });

  it("gives every click its own GM and Group", async () => {
    const first = await createYourLink(t);
    const second = await createYourLink(t);

    expect(second.userId).not.toBe(first.userId);
    const [firstGroup] = await first.as.query(api.groups.mine, {});
    const [secondGroup] = await second.as.query(api.groups.mine, {});
    expect(secondGroup?.id).not.toBe(firstGroup?.id);
  });
});

describe("the anonymous sign-up limit", () => {
  const BURST = 60;

  async function countUsers() {
    return (await t.run(async (ctx) => await ctx.db.query("users").collect())).length;
  }

  it("refuses the click after a burst of 60 and creates nothing for it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let click = 0; click < BURST; click++) await createYourLink(t);

    const data = await expectErrorCode(createYourLink(t), "RATE_LIMITED");

    expect(data.retryAfter).toBeGreaterThan(0);
    expect(await countUsers()).toBe(BURST);
  });
});

describe("Accounts", () => {
  it("creates an Account with no Groups and the Legal Acceptance of its sheet", async () => {
    const credentials = newCredentials();
    const before = Date.now();
    const { as, userId } = await signUpAccount(t, credentials);

    expect(await as.query(api.account.me, {})).toEqual({
      isAnonymous: false,
      email: credentials.email,
    });
    expect(await as.query(api.groups.mine, {})).toEqual([]);
    const acceptance = await legalAcceptanceOf(userId);
    expect(acceptance).toMatchObject({
      terms: LEGAL_VERSIONS.terms,
      privacy: LEGAL_VERSIONS.privacy,
    });
    expect(acceptance.at).toBeGreaterThanOrEqual(before);
  });

  it("logs in to the same Account however the email is cased or padded", async () => {
    const { userId } = await signUpAccount(t, {
      email: " Ada@Example.com ",
      password: "correct horse battery",
    });

    const loggedIn = await logInAccount(t, {
      email: "ada@example.com",
      password: "correct horse battery",
    });

    expect(loggedIn.userId).toBe(userId);
  });

  it("refuses a wrong password as invalid credentials", async () => {
    const credentials = newCredentials();
    await signUpAccount(t, credentials);

    await expectErrorCode(
      logInAccount(t, { ...credentials, password: "wrong horse battery" }),
      "INVALID_CREDENTIALS",
    );
  });

  it("refuses an unknown email as invalid credentials", async () => {
    await expectErrorCode(logInAccount(t, newCredentials()), "INVALID_CREDENTIALS");
  });

  it("refuses a password shorter than 8 characters as weak", async () => {
    await expectErrorCode(
      signUpAccount(t, { email: "short@example.com", password: "1234567" }),
      "WEAK_PASSWORD",
    );
  });

  it("never signs in through a sign-up for a taken email, so guesses meet the sign-in throttle", async () => {
    const credentials = newCredentials();
    await signUpAccount(t, credentials);

    await expectErrorCode(signUpAccount(t, credentials), "EMAIL_TAKEN");
  });

  it("refuses a second Account for the same email", async () => {
    const credentials = newCredentials();
    await signUpAccount(t, credentials);

    await expectErrorCode(
      signUpAccount(t, { ...credentials, password: "another password" }),
      "EMAIL_TAKEN",
    );
  });

  it("locks an Account after 10 wrong passwords, even against the right one", async () => {
    const credentials = newCredentials();
    await signUpAccount(t, credentials);
    const wrong = { ...credentials, password: "wrong horse battery" };
    for (let attempt = 0; attempt < 10; attempt++) {
      await expectErrorCode(logInAccount(t, wrong), "INVALID_CREDENTIALS");
    }

    const data = await expectErrorCode(logInAccount(t, credentials), "RATE_LIMITED");

    expect(data.retryAfter).toBeGreaterThan(0);
  });
});

describe("the Account sign-up limit", () => {
  const BURST = 20;

  async function countAccounts() {
    return (await t.run(async (ctx) => await ctx.db.query("authAccounts").collect())).length;
  }

  it("refuses a sign-up after a burst of 20 and creates no Account for it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let signUp = 0; signUp < BURST; signUp++) await signUpAccount(t);

    const data = await expectErrorCode(signUpAccount(t), "RATE_LIMITED");

    expect(data.retryAfter).toBeGreaterThan(0);
    expect(await countAccounts()).toBe(BURST);
  });
});

describe("the session lifetime", () => {
  async function createYourLinkTokens() {
    const { tokens } = await t.action(api.auth.signIn, { provider: "anonymous" });
    return tokens!.refreshToken;
  }

  async function refresh(refreshToken: string) {
    const { tokens } = await t.action(api.auth.signIn, { refreshToken });
    return tokens?.refreshToken ?? null;
  }

  function travel(days: number) {
    vi.setSystemTime(Date.now() + days * DAY);
  }

  async function returnEvery29DaysForAYear(refreshToken: string) {
    for (let visit = 0; visit < 12; visit++) {
      travel(29);
      const next = await refresh(refreshToken);
      expect(next, `visit on day ${(visit + 1) * 29}`).toBeTypeOf("string");
      refreshToken = next!;
    }
    return refreshToken;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  it("keeps a GM who returns within every 30 days signed in for a year", async () => {
    await returnEvery29DaysForAYear(await createYourLinkTokens());
  });

  it("ends the session a year after sign-in, however active the GM is", async () => {
    const refreshToken = await returnEvery29DaysForAYear(await createYourLinkTokens());

    travel(365 - 12 * 29 + 1);

    expect(await refresh(refreshToken)).toBeNull();
  });

  it("ends the session after 30 quiet days", async () => {
    const refreshToken = await createYourLinkTokens();

    travel(UNSAVED_GROUP_QUIET_DAYS + 1);

    expect(await refresh(refreshToken)).toBeNull();
  });
});
