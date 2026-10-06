import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayUtc } from "../shared/dates";
import { LEGAL_VERSIONS } from "../shared/legal";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createYourLink, signUpAccount, withAuthKeys } from "./auth.test.setup";
import {
  expectErrorCode,
  type GmClient,
  newBackend,
  signInAccount,
  spendGmEdits,
  type TestBackend,
} from "./model/test.setup";

withAuthKeys();

let t: TestBackend;

beforeEach(() => {
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

const MINUTE = 60_000;

async function groupsOf(gm: GmClient) {
  const groups = await gm.query(api.groups.mine, {});
  return await Promise.all(groups.map(({ id }) => gm.query(api.groups.get, { groupId: id })));
}

async function authRowsOf(userId: Id<"users">) {
  return await t.run(async (ctx) => ({
    user: await ctx.db.get("users", userId),
    accounts: await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect(),
    sessions: await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect(),
  }));
}

describe("account.me", () => {
  it("knows nobody when signed out", async () => {
    expect(await t.query(api.account.me, {})).toBeNull();
  });
});

describe("Save", () => {
  it("moves the Unsaved Group to the Account with the same Share Link and no Expiry", async () => {
    const anonymous = await createYourLink(t);
    const [unsaved] = await groupsOf(anonymous.as);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);

    const { groupIds } = await account.as.mutation(api.account.finishSave, { code });

    expect(groupIds).toEqual([unsaved!.id]);
    const [saved] = await groupsOf(account.as);
    expect(saved).toMatchObject({ id: unsaved!.id, shareToken: unsaved!.shareToken });
    expect(saved?.expiresAt).toBeUndefined();
  });

  it("adds to an Account's Groups and never replaces them", async () => {
    const account = await signUpAccount(t);
    await account.as.mutation(api.groups.create, {});
    await account.as.mutation(api.groups.create, {});
    const existing = await groupsOf(account.as);
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});

    const { groupIds } = await account.as.mutation(api.account.finishSave, { code });

    const after = await groupsOf(account.as);
    expect(after).toHaveLength(3);
    expect(after).toEqual(expect.arrayContaining(existing));
    expect(after.map((group) => group?.id)).toEqual(expect.arrayContaining(groupIds));
  });

  it("moves every Group of the Anonymous GM", async () => {
    const anonymous = await createYourLink(t);
    await anonymous.as.mutation(api.groups.create, {});
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);

    const { groupIds } = await account.as.mutation(api.account.finishSave, { code });

    expect(groupIds).toHaveLength(2);
    expect(await account.as.query(api.groups.mine, {})).toHaveLength(2);
  });

  it("keeps the Sessions the Anonymous GM scheduled on the moved Groups", async () => {
    const anonymous = await createYourLink(t);
    const [group] = await anonymous.as.query(api.groups.mine, {});
    const sessionId = await anonymous.as.mutation(api.sessions.schedule, {
      groupId: group!.id,
      date: todayUtc(Date.now()),
    });
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);

    await account.as.mutation(api.account.finishSave, { code });

    const session = await t.run(async (ctx) => await ctx.db.get("sessions", sessionId));
    expect(session?.groupId).toBe(group!.id);
  });

  it("ends the Anonymous GM with its sign-in", async () => {
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);

    await account.as.mutation(api.account.finishSave, { code });

    expect(await anonymous.as.query(api.account.me, {})).toBeNull();
    expect(await authRowsOf(anonymous.userId)).toEqual({ user: null, accounts: [], sessions: [] });
  });

  it("copies the Legal Acceptance onto an Account that has none", async () => {
    const anonymous = await createYourLink(t);
    const accepted = await t.run(async (ctx) => await ctx.db.get("users", anonymous.userId));
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signInAccount(t);

    await account.as.mutation(api.account.finishSave, { code });

    const user = await t.run(async (ctx) => await ctx.db.get("users", account.userId));
    expect(user).toMatchObject({
      acceptedTermsVersion: LEGAL_VERSIONS.terms,
      acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
      acceptedLegalAt: accepted!.acceptedLegalAt!,
    });
  });

  it("keeps the Legal Acceptance an Account already has", async () => {
    const account = await signUpAccount(t);
    const accepted = await t.run(async (ctx) => await ctx.db.get("users", account.userId));
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});

    await account.as.mutation(api.account.finishSave, { code });

    const user = await t.run(async (ctx) => await ctx.db.get("users", account.userId));
    expect(user?.acceptedLegalAt).toBe(accepted?.acceptedLegalAt);
  });

  it("stores the claim code only as a hash", async () => {
    const anonymous = await createYourLink(t);

    const { code } = await anonymous.as.mutation(api.account.startSave, {});

    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const claims = await t.run(async (ctx) => await ctx.db.query("saveClaims").collect());
    expect(claims).toHaveLength(1);
    expect(JSON.stringify(claims)).not.toContain(code);
  });
});

describe("Save past the Group cap", () => {
  async function seedGroups(ownerId: Id<"users">, count: number) {
    await t.run(async (ctx) => {
      for (let index = 0; index < count; index++) {
        await ctx.db.insert("groups", {
          ownerId,
          name: `Table ${index}`,
          shareToken: `table${String(index).padStart(5, "0")}`,
        });
      }
    });
  }

  it("refuses to give an Account more than 50 Groups and moves nothing", async () => {
    const anonymous = await createYourLink(t);
    await anonymous.as.mutation(api.groups.create, {});
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);
    await seedGroups(account.userId, 49);

    await expectErrorCode(account.as.mutation(api.account.finishSave, { code }), "TOO_MANY_GROUPS");

    expect(await account.as.query(api.groups.mine, {})).toHaveLength(49);
    expect(await anonymous.as.query(api.groups.mine, {})).toHaveLength(2);
  });

  it("saves up to exactly 50 Groups", async () => {
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);
    await seedGroups(account.userId, 49);

    await account.as.mutation(api.account.finishSave, { code });

    expect(await account.as.query(api.groups.mine, {})).toHaveLength(50);
  });
});

describe("claim upkeep", () => {
  it("clears the Anonymous GM's expired claims when it starts another Save", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const anonymous = await createYourLink(t);
    await anonymous.as.mutation(api.account.startSave, {});
    await anonymous.as.mutation(api.account.startSave, {});
    vi.setSystemTime(Date.now() + 10 * MINUTE + 1);

    const { code } = await anonymous.as.mutation(api.account.startSave, {});

    const claims = await t.run(async (ctx) => await ctx.db.query("saveClaims").collect());
    expect(claims).toHaveLength(1);
    const account = await signUpAccount(t);
    await account.as.mutation(api.account.finishSave, { code });
  });
});

describe("a claim code that cannot be redeemed", () => {
  it("is refused the second time", async () => {
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);
    await account.as.mutation(api.account.finishSave, { code });

    await expectErrorCode(account.as.mutation(api.account.finishSave, { code }), "CLAIM_INVALID");
  });

  it("is refused after 10 minutes and moves nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);
    vi.setSystemTime(Date.now() + 10 * MINUTE + 1);

    await expectErrorCode(account.as.mutation(api.account.finishSave, { code }), "CLAIM_INVALID");
    expect(await account.as.query(api.groups.mine, {})).toEqual([]);
  });

  it("is refused when it was never issued", async () => {
    const account = await signUpAccount(t);

    await expectErrorCode(
      account.as.mutation(api.account.finishSave, { code: "a".repeat(43) }),
      "CLAIM_INVALID",
    );
  });
});

describe("who may Save", () => {
  it("lets only an Anonymous GM start a Save", async () => {
    const account = await signUpAccount(t);

    await expectErrorCode(account.as.mutation(api.account.startSave, {}), "UNAUTHENTICATED");
    await expectErrorCode(t.mutation(api.account.startSave, {}), "UNAUTHENTICATED");
  });

  it("lets only an Account finish a Save", async () => {
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const other = await createYourLink(t);

    await expectErrorCode(other.as.mutation(api.account.finishSave, { code }), "UNAUTHENTICATED");
    await expectErrorCode(t.mutation(api.account.finishSave, { code }), "UNAUTHENTICATED");
  });

  it("limits an Anonymous GM to 10 Save starts an hour", async () => {
    const anonymous = await createYourLink(t);
    for (let start = 0; start < 10; start++) {
      await anonymous.as.mutation(api.account.startSave, {});
    }

    await expectErrorCode(anonymous.as.mutation(api.account.startSave, {}), "RATE_LIMITED");
  });

  it("refuses to finish a Save once the Account's GM edits are spent, and moves nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const anonymous = await createYourLink(t);
    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);
    await spendGmEdits(t, account.userId);

    await expectErrorCode(account.as.mutation(api.account.finishSave, { code }), "RATE_LIMITED");
    expect(await account.as.query(api.groups.mine, {})).toEqual([]);
  });
});
