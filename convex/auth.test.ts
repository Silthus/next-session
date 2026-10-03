import { beforeEach, describe, expect, it } from "vitest";
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
    expect(groups).toEqual([{ id: expect.any(String), name: "My group", playerCount: 0 }]);
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
    for (let click = 0; click < BURST; click++) await createYourLink(t);

    const data = await expectErrorCode(createYourLink(t), "RATE_LIMITED");

    expect(data.retryAfter).toBeGreaterThan(0);
    expect(await countUsers()).toBe(BURST);
  });
});

describe("Accounts", () => {
  it("creates an Account with no Groups and the Legal Acceptance of its sheet", async () => {
    const credentials = newCredentials();
    const { as, userId } = await signUpAccount(t, credentials);

    expect(await as.query(api.account.me, {})).toEqual({
      isAnonymous: false,
      email: credentials.email,
    });
    expect(await as.query(api.groups.mine, {})).toEqual([]);
    expect(await legalAcceptanceOf(userId)).toMatchObject({
      terms: LEGAL_VERSIONS.terms,
      privacy: LEGAL_VERSIONS.privacy,
    });
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

  it("refuses a wrong password", async () => {
    const credentials = newCredentials();
    await signUpAccount(t, credentials);

    await expect(
      logInAccount(t, { ...credentials, password: "wrong horse battery" }),
    ).rejects.toThrow("InvalidSecret");
  });

  it("refuses a password shorter than 8 characters", async () => {
    await expect(
      signUpAccount(t, { email: "short@example.com", password: "1234567" }),
    ).rejects.toThrow("Invalid password");
  });

  it("refuses a second Account for the same email", async () => {
    const credentials = newCredentials();
    await signUpAccount(t, credentials);

    await expect(
      signUpAccount(t, { ...credentials, password: "another password" }),
    ).rejects.toThrow("already exists");
  });
});
