import { beforeEach, describe, expect, it } from "vitest";
import { LEGAL_VERSIONS } from "../shared/legal";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createYourLink,
  FOREIGN_PICTURE,
  GOOGLE_PICTURES,
  logInAccount,
  pictureBytes,
  pictureFailures,
  newCredentials,
  signInWithGoogle,
  signUpAccount,
  withAuthKeys,
  withGoogleCredentials,
} from "./auth.test.setup";
import { newBackend, signedInGmWithGroup, type TestBackend } from "./model/test.setup";

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

function withPicture(identity = newGoogleIdentity()) {
  return { ...identity, picture: `${GOOGLE_PICTURES}photo-${++googleCount}=s96-c` };
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

  it("never joins two Google identities by their email", async () => {
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

describe("Google profile picture", () => {
  async function storedPictureOf(userId: Id<"users">) {
    return await t.run(async (ctx) => {
      const user = await ctx.db.get("users", userId);
      const file = user?.profileImageId && (await ctx.storage.get(user.profileImageId));
      return { fileId: user?.profileImageId, bytes: file ? await file.text() : undefined };
    });
  }

  async function fileExists(fileId: Id<"_storage">) {
    return await t.run(async (ctx) => (await ctx.storage.get(fileId)) !== null);
  }

  it("shows the Account its Google picture from our own storage, not Google's", async () => {
    const identity = withPicture();
    const { as, userId } = await signInWithGoogle(t, identity);

    const { image } = (await as.query(api.account.me, {}))!;
    expect(image).toBeTypeOf("string");
    expect(image).not.toContain("googleusercontent");
    expect((await storedPictureOf(userId)).bytes).toBe(pictureBytes(identity.picture));
  });

  it("swaps in the new picture at the next sign-in and deletes the old copy", async () => {
    const identity = withPicture();
    const first = await signInWithGoogle(t, identity);
    const { fileId: oldFileId } = await storedPictureOf(first.userId);

    const changed = withPicture(identity);
    await signInWithGoogle(t, changed);

    expect((await storedPictureOf(first.userId)).bytes).toBe(pictureBytes(changed.picture));
    expect(await fileExists(oldFileId!)).toBe(false);
  });

  it("drops the picture once Google sends none", async () => {
    const identity = withPicture();
    const { as, userId } = await signInWithGoogle(t, identity);
    const { fileId } = await storedPictureOf(userId);

    await signInWithGoogle(t, { ...identity, picture: undefined });

    expect((await as.query(api.account.me, {}))?.image).toBeUndefined();
    expect(await fileExists(fileId!)).toBe(false);
  });

  it("shows the picture at the next sign-in after it failed to load", async () => {
    const identity = withPicture();
    pictureFailures.set(identity.picture, "missing");
    const { as } = await signInWithGoogle(t, identity);
    expect((await as.query(api.account.me, {}))?.image).toBeUndefined();

    pictureFailures.delete(identity.picture);
    await signInWithGoogle(t, identity);

    expect((await as.query(api.account.me, {}))?.image).toBeTypeOf("string");
  });

  it.each([
    ["does not load", "missing"],
    ["breaks off mid-download", "brokenOff"],
  ] as const)("drops the old picture when the new one %s", async (_, failure) => {
    const identity = withPicture();
    const { as, userId } = await signInWithGoogle(t, identity);
    const { fileId } = await storedPictureOf(userId);

    const changed = withPicture(identity);
    pictureFailures.set(changed.picture, failure);
    await signInWithGoogle(t, changed);

    expect((await as.query(api.account.me, {}))?.image).toBeUndefined();
    expect(await fileExists(fileId!)).toBe(false);
  });

  it("keeps a copied picture when an overlapping download of it fails", async () => {
    const identity = withPicture();
    const { as, userId } = await signInWithGoogle(t, identity);

    await t.mutation(internal.profileImages.replace, {
      userId,
      from: identity.picture,
      imageId: null,
    });

    expect((await as.query(api.account.me, {}))?.image).toBeTypeOf("string");
  });

  it("never fetches a picture from outside Google's picture host", async () => {
    const { as } = await signInWithGoogle(t, {
      ...newGoogleIdentity(),
      picture: FOREIGN_PICTURE,
    });

    expect((await as.query(api.account.me, {}))?.image).toBeUndefined();
  });

  it("shows a Claimed Player's picture to the GM, but not on the Share Link", async () => {
    const gm = await signedInGmWithGroup(t);
    const { shareToken } = (await gm.as.query(api.groups.get, { groupId: gm.groupId }))!;
    const graceId = await gm.as.mutation(api.roster.addPlayer, {
      groupId: gm.groupId,
      name: "Grace",
    });
    const ada = await signInWithGoogle(t, withPicture());
    const adaId = await ada.as.mutation(api.player.join, { shareToken, name: "Ada" });
    const adasPicture = (await ada.as.query(api.account.me, {}))?.image;

    const schedule = await gm.as.query(api.schedule.month, {
      groupId: gm.groupId,
      month: "2026-10",
    });

    expect(schedule?.players).toEqual([
      { _id: adaId, name: "Ada", image: adasPicture },
      { _id: graceId, name: "Grace" },
    ]);
    const shareLink = await t.query(api.player.group, { shareToken });
    expect(shareLink?.players.map((player) => Object.keys(player))).toEqual([
      ["_id", "name"],
      ["_id", "name"],
    ]);
  });
});
