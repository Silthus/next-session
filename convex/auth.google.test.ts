import { beforeEach, describe, expect, it } from "vitest";
import { LEGAL_VERSIONS } from "../shared/legal";
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
import { newBackend, type TestBackend } from "./model/test.setup";

withAuthKeys();
withGoogleCredentials();

let t: TestBackend;

beforeEach(() => {
  t = newBackend();
});

let googleCount = 0;

function newGoogleIdentity(email = `google-${++googleCount}@example.com`) {
  return { sub: `google-sub-${++googleCount}`, email };
}

async function userOf(userId: Id<"users">) {
  return await t.run(async (ctx) => await ctx.db.get("users", userId));
}

describe("Continue with Google", () => {
  it("reports Google on once both of its credentials are set", async () => {
    expect(await t.query(api.signInOptions.available, {})).toEqual({ google: true });
  });

  it("creates an Account with the Google email and the Legal Acceptance of its sheet", async () => {
    const before = Date.now();
    const { as, userId } = await signInWithGoogle(t, newGoogleIdentity("Ada@Example.com"));

    expect(await as.query(api.account.me, {})).toEqual({
      isAnonymous: false,
      email: "ada@example.com",
    });
    expect(await as.query(api.groups.mine, {})).toEqual([]);
    const user = await userOf(userId);
    expect(user).toMatchObject({
      acceptedTermsVersion: LEGAL_VERSIONS.terms,
      acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
    });
    expect(user?.acceptedLegalAt).toBeGreaterThanOrEqual(before);
  });

  it("signs in to the same Account the next time", async () => {
    const identity = newGoogleIdentity();
    const first = await signInWithGoogle(t, identity);

    const again = await signInWithGoogle(t, identity);

    expect(again.userId).toBe(first.userId);
  });

  it("comes back to the page it left", async () => {
    const { backToApp } = await signInWithGoogle(t, newGoogleIdentity(), {
      redirectTo: "/g/some-group",
    });

    expect(`${backToApp.origin}${backToApp.pathname}`).toBe("http://localhost:5173/g/some-group");
  });
});

describe("Google and Password on one email", () => {
  it("never signs Google in to a Password Account, whose email nobody verified", async () => {
    const credentials = newCredentials();
    const password = await signUpAccount(t, credentials);
    await password.as.mutation(api.groups.create, {});

    const google = await signInWithGoogle(t, newGoogleIdentity(credentials.email));

    expect(google.userId).not.toBe(password.userId);
    expect(await google.as.query(api.groups.mine, {})).toEqual([]);
    expect((await logInAccount(t, credentials)).userId).toBe(password.userId);
  });

  it("never adds a Password to a Google Account by its email", async () => {
    const identity = newGoogleIdentity();
    const google = await signInWithGoogle(t, identity);
    await google.as.mutation(api.groups.create, {});

    const password = await signUpAccount(t, { ...newCredentials(), email: identity.email });

    expect(password.userId).not.toBe(google.userId);
    expect(await password.as.query(api.groups.mine, {})).toEqual([]);
  });

  it("never joins two Google identities by their email, verified or not", async () => {
    const email = "shared@example.com";
    const first = await signInWithGoogle(t, newGoogleIdentity(email));

    const second = await signInWithGoogle(t, newGoogleIdentity(email));

    expect(second.userId).not.toBe(first.userId);
    expect((await userOf(first.userId))?.emailVerificationTime).toBeUndefined();
  });
});

describe("Save through Google", () => {
  it("moves the anonymous Groups to the Google Account after the round trip", async () => {
    const anonymous = await createYourLink(t);
    const [group] = await anonymous.as.query(api.groups.mine, {});
    const { code } = await anonymous.as.mutation(api.account.startSave, {});

    const google = await signInWithGoogle(t, newGoogleIdentity(), {
      from: anonymous.as,
      redirectTo: `/g/${group!.id}`,
    });
    const saved = await google.as.mutation(api.account.finishSave, { code });

    expect(saved.groupIds).toEqual([group!.id]);
    const moved = await google.as.query(api.groups.get, { groupId: group!.id });
    expect(moved?.expiresAt).toBeUndefined();
    expect(await userOf(anonymous.userId)).toBeNull();
  });
});
