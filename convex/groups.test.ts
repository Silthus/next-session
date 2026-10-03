import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHARE_TOKEN_LENGTH } from "../shared/shareToken";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { groupByShareToken } from "./model/access";
import { insertGroup } from "./model/groups";
import {
  expectErrorCode,
  type GmClient,
  newBackend,
  signInAccount,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 12);
const SHARE_TOKEN_SHAPE = new RegExp(`^[A-Za-z0-9_-]{${SHARE_TOKEN_LENGTH}}$`);

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedGroups(ownerId: Id<"users">, count: number) {
  await t.run(async (ctx) => {
    const owner = (await ctx.db.get("users", ownerId))!;
    for (let index = 0; index < count; index++) await insertGroup(ctx, owner);
  });
}

async function readGroup(groupId: Id<"groups">) {
  return await t.run(async (ctx) => await ctx.db.get("groups", groupId));
}

async function readUser(userId: Id<"users">) {
  return await t.run(async (ctx) => await ctx.db.get("users", userId));
}

describe("groups.create", () => {
  it("gives an Anonymous GM an Unsaved Group that expires after 30 quiet days", async () => {
    const { as, userId } = await signInAnonymousGm(t);

    const groupId = await as.mutation(api.groups.create, {});

    const group = await readGroup(groupId);
    expect(group).toMatchObject({ ownerId: userId, name: "My group", expiresAt: NOW + 30 * DAY });
    expect(group?.shareToken).toMatch(SHARE_TOKEN_SHAPE);
  });

  it("gives an Account a Group that never expires", async () => {
    const { as } = await signInAccount(t);

    const groupId = await as.mutation(api.groups.create, {});

    expect((await readGroup(groupId))?.expiresAt).toBeUndefined();
  });

  it("mints a different Share Token for every Group", async () => {
    const { as } = await signInAccount(t);

    const first = await readGroup(await as.mutation(api.groups.create, {}));
    const second = await readGroup(await as.mutation(api.groups.create, {}));

    expect(first?.shareToken).not.toBe(second?.shareToken);
  });

  it("rejects a signed-out caller", async () => {
    await expectErrorCode(t.mutation(api.groups.create, {}), "UNAUTHENTICATED");
  });

  it("caps a GM at 50 Groups", async () => {
    const { as, userId } = await signInAccount(t);
    await seedGroups(userId, 50);

    await expectErrorCode(as.mutation(api.groups.create, {}), "TOO_MANY_GROUPS");
  });

  it("rate limits a GM to a burst of 5 Groups, refilling 10 per hour", async () => {
    const { as } = await signInAccount(t);
    for (let index = 0; index < 5; index++) await as.mutation(api.groups.create, {});

    const error = await expectErrorCode(as.mutation(api.groups.create, {}), "RATE_LIMITED");
    expect(error.retryAfter).toBe(6 * 60_000);

    vi.advanceTimersByTime(6 * 60_000 - 1);
    await expectErrorCode(as.mutation(api.groups.create, {}), "RATE_LIMITED");
    vi.advanceTimersByTime(1);
    await expect(as.mutation(api.groups.create, {})).resolves.toBeDefined();
    await expectErrorCode(as.mutation(api.groups.create, {}), "RATE_LIMITED");
  });

  it("rate limits each GM separately", async () => {
    const first = await signInAccount(t);
    const second = await signInAccount(t);
    for (let index = 0; index < 5; index++) await first.as.mutation(api.groups.create, {});

    await expect(second.as.mutation(api.groups.create, {})).resolves.toBeDefined();
  });
});

describe("groups.mine", () => {
  it("lists only the caller's Groups, oldest first, with their Player counts", async () => {
    const gm = await signInAccount(t);
    const other = await signInAccount(t);
    const older = await gm.as.mutation(api.groups.create, {});
    vi.advanceTimersByTime(1000);
    const newer = await gm.as.mutation(api.groups.create, {});
    await other.as.mutation(api.groups.create, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("players", { groupId: newer, name: "Ada", nameKey: "ada" });
      await ctx.db.insert("players", { groupId: newer, name: "Bo", nameKey: "bo" });
    });

    expect(await gm.as.query(api.groups.mine, {})).toEqual([
      { id: older, name: "My group", playerCount: 0 },
      { id: newer, name: "My group", playerCount: 2 },
    ]);
  });

  it("is empty for a signed-out caller", async () => {
    expect(await t.query(api.groups.mine, {})).toEqual([]);
  });
});

describe("groups.get", () => {
  it("shows the owner the Group with its Share Token and Expiry", async () => {
    const { as } = await signInAnonymousGm(t);
    const groupId = await as.mutation(api.groups.create, {});
    const { shareToken } = (await readGroup(groupId))!;

    expect(await as.query(api.groups.get, { groupId })).toEqual({
      id: groupId,
      name: "My group",
      shareToken,
      expiresAt: NOW + 30 * DAY,
      canUndoRotate: false,
    });
  });

  it("returns null for a Group the caller does not own", async () => {
    const owner = await signInAccount(t);
    const stranger = await signInAccount(t);
    const groupId = await owner.as.mutation(api.groups.create, {});

    expect(await stranger.as.query(api.groups.get, { groupId })).toBeNull();
  });

  it("returns null for a deleted Group", async () => {
    const { as } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});
    await as.mutation(api.groups.remove, { groupId });

    expect(await as.query(api.groups.get, { groupId })).toBeNull();
  });

  it("returns null for a signed-out caller", async () => {
    const { as } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});

    expect(await t.query(api.groups.get, { groupId })).toBeNull();
  });

  it.each(["not-an-id", "j57abc"])("returns null for the malformed id %j", async (groupId) => {
    const { as } = await signInAccount(t);

    expect(await as.query(api.groups.get, { groupId })).toBeNull();
  });

  it("returns null for the id of a row in another table", async () => {
    const { as, userId } = await signInAccount(t);

    expect(await as.query(api.groups.get, { groupId: userId })).toBeNull();
  });
});

describe("groups.rename", () => {
  it("stores the normalized name", async () => {
    const { as } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});

    await as.mutation(api.groups.rename, { groupId, name: "  Friday   Night  Crew " });

    expect((await readGroup(groupId))?.name).toBe("Friday Night Crew");
  });

  it.each([" ", "x".repeat(61)])("rejects the invalid name %j", async (name) => {
    const { as } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});

    await expectErrorCode(as.mutation(api.groups.rename, { groupId, name }), "INVALID_NAME");
  });

  it("treats a Group the caller does not own as missing", async () => {
    const owner = await signInAccount(t);
    const stranger = await signInAccount(t);
    const groupId = await owner.as.mutation(api.groups.create, {});

    await expectErrorCode(
      stranger.as.mutation(api.groups.rename, { groupId, name: "Mine now" }),
      "NOT_FOUND",
    );
    expect((await readGroup(groupId))?.name).toBe("My group");
  });

  it("rejects a signed-out caller", async () => {
    const { as } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});

    await expectErrorCode(
      t.mutation(api.groups.rename, { groupId, name: "Anyone" }),
      "UNAUTHENTICATED",
    );
  });
});

describe("the Expiry of an Unsaved Group", () => {
  it.each([
    [
      "renaming it",
      (as: GmClient, groupId: Id<"groups">) =>
        as.mutation(api.groups.rename, { groupId, name: "Renamed" }),
    ],
    [
      "rotating its Share Link",
      (as: GmClient, groupId: Id<"groups">) =>
        as.mutation(api.groups.rotateShareToken, { groupId }),
    ],
  ])("is pushed out to 30 days from now by %s", async (_, write) => {
    const { as } = await signInAnonymousGm(t);
    const groupId = await as.mutation(api.groups.create, {});
    vi.advanceTimersByTime(2 * DAY);

    await write(as, groupId);

    expect((await readGroup(groupId))?.expiresAt).toBe(NOW + 32 * DAY);
  });

  it("is pushed out by an Undo of the rotation", async () => {
    const { as } = await signInAnonymousGm(t);
    const groupId = await as.mutation(api.groups.create, {});
    vi.advanceTimersByTime(DAY - 10_000);
    await as.mutation(api.groups.rotateShareToken, { groupId });
    vi.advanceTimersByTime(20_000);

    await as.mutation(api.groups.undoRotateShareToken, { groupId });

    expect((await readGroup(groupId))?.expiresAt).toBe(NOW + 31 * DAY + 10_000);
  });

  it("is pushed at most once a day", async () => {
    const { as } = await signInAnonymousGm(t);
    const groupId = await as.mutation(api.groups.create, {});
    vi.advanceTimersByTime(DAY - 1);

    await as.mutation(api.groups.rename, { groupId, name: "Renamed" });

    expect((await readGroup(groupId))?.expiresAt).toBe(NOW + 30 * DAY);
  });
});

describe("groups.remove", () => {
  async function seedChildren(groupId: Id<"groups">, answers: number) {
    await t.run(async (ctx) => {
      const playerId = await ctx.db.insert("players", { groupId, name: "Ada", nameKey: "ada" });
      for (let day = 0; day < answers; day++) {
        const date = new Date(NOW + day * DAY).toISOString().slice(0, 10);
        await ctx.db.insert("answers", { groupId, playerId, date, answer: "free" });
      }
      await ctx.db.insert("sessions", { groupId, date: "2026-10-09" });
    });
  }

  async function countChildren(groupId: Id<"groups">) {
    return await t.run(async (ctx) => {
      const players = await ctx.db
        .query("players")
        .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
        .collect();
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
        .collect();
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
        .collect();
      return players.length + answers.length + sessions.length;
    });
  }

  it("deletes the Group with its Roster, Answers, and Sessions", async () => {
    const { as, userId } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});
    await seedChildren(groupId, 450);

    await as.mutation(api.groups.remove, { groupId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await readGroup(groupId)).toBeNull();
    expect(await countChildren(groupId)).toBe(0);
  });

  it("keeps the other Groups and their rows", async () => {
    const { as, userId } = await signInAccount(t);
    const removed = await as.mutation(api.groups.create, {});
    const kept = await as.mutation(api.groups.create, {});
    await seedChildren(removed, 3);
    await seedChildren(kept, 3);

    await as.mutation(api.groups.remove, { groupId: removed });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await readGroup(kept)).not.toBeNull();
    expect(await countChildren(kept)).toBe(5);
  });

  async function seedAuthRows(userId: Id<"users">, sessionId: Id<"authSessions">) {
    return await t.run(async (ctx) => {
      const accountId = await ctx.db.insert("authAccounts", {
        userId,
        provider: "anonymous",
        providerAccountId: userId,
      });
      const codeId = await ctx.db.insert("authVerificationCodes", {
        accountId,
        provider: "anonymous",
        code: `code-${userId}`,
        expirationTime: NOW + DAY,
      });
      const refreshTokenId = await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: NOW + DAY,
      });
      const saveClaimId = await ctx.db.insert("saveClaims", {
        anonymousUserId: userId,
        codeHash: `hash-${userId}`,
        expiresAt: NOW + DAY,
      });
      return [userId, sessionId, accountId, codeId, refreshTokenId, saveClaimId] as const;
    });
  }

  async function surviving(
    ids: readonly [
      Id<"users">,
      Id<"authSessions">,
      Id<"authAccounts">,
      Id<"authVerificationCodes">,
      Id<"authRefreshTokens">,
      Id<"saveClaims">,
    ],
  ) {
    const [userId, sessionId, accountId, codeId, refreshTokenId, saveClaimId] = ids;
    return await t.run(
      async (ctx) =>
        [
          await ctx.db.get("users", userId),
          await ctx.db.get("authSessions", sessionId),
          await ctx.db.get("authAccounts", accountId),
          await ctx.db.get("authVerificationCodes", codeId),
          await ctx.db.get("authRefreshTokens", refreshTokenId),
          await ctx.db.get("saveClaims", saveClaimId),
        ].filter((row) => row !== null).length,
    );
  }

  it("ends an Anonymous GM with its last Group, auth rows and Save Claims included", async () => {
    const gm = await signInAnonymousGm(t);
    const bystander = await signInAnonymousGm(t);
    const groupId = await gm.as.mutation(api.groups.create, {});
    await bystander.as.mutation(api.groups.create, {});
    const gmRows = await seedAuthRows(gm.userId, gm.sessionId);
    const bystanderRows = await seedAuthRows(bystander.userId, bystander.sessionId);

    await gm.as.mutation(api.groups.remove, { groupId });

    expect(await surviving(gmRows)).toBe(0);
    expect(await surviving(bystanderRows)).toBe(6);
  });

  it("keeps an Anonymous GM that still owns another Group", async () => {
    const { as, userId } = await signInAnonymousGm(t);
    const groupId = await as.mutation(api.groups.create, {});
    await as.mutation(api.groups.create, {});

    await as.mutation(api.groups.remove, { groupId });

    expect(await readUser(userId)).not.toBeNull();
  });

  it("keeps an Account that removes its last Group", async () => {
    const { as, userId } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});

    await as.mutation(api.groups.remove, { groupId });

    expect(await readUser(userId)).not.toBeNull();
  });

  it("treats a Group the caller does not own as missing", async () => {
    const owner = await signInAccount(t);
    const stranger = await signInAccount(t);
    const groupId = await owner.as.mutation(api.groups.create, {});

    await expectErrorCode(stranger.as.mutation(api.groups.remove, { groupId }), "NOT_FOUND");
    expect(await readGroup(groupId)).not.toBeNull();
  });

  it("rejects a signed-out caller", async () => {
    const { as } = await signInAccount(t);
    const groupId = await as.mutation(api.groups.create, {});

    await expectErrorCode(t.mutation(api.groups.remove, { groupId }), "UNAUTHENTICATED");
  });
});

describe("rotating the Share Link", () => {
  async function createGroup() {
    const gm = await signInAccount(t);
    const groupId = await gm.as.mutation(api.groups.create, {});
    const { shareToken } = (await readGroup(groupId))!;
    return { ...gm, groupId, shareToken };
  }

  it("replaces the Share Token and offers Undo", async () => {
    const { as, groupId, shareToken } = await createGroup();

    await as.mutation(api.groups.rotateShareToken, { groupId });

    const view = await as.query(api.groups.get, { groupId });
    expect(view?.shareToken).toMatch(SHARE_TOKEN_SHAPE);
    expect(view?.shareToken).not.toBe(shareToken);
    expect(view?.canUndoRotate).toBe(true);
  });

  it("restores the old Share Token on Undo within 30 seconds", async () => {
    const { as, groupId, shareToken } = await createGroup();
    await as.mutation(api.groups.rotateShareToken, { groupId });
    vi.advanceTimersByTime(30_000);

    await as.mutation(api.groups.undoRotateShareToken, { groupId });

    expect(await as.query(api.groups.get, { groupId })).toMatchObject({
      shareToken,
      canUndoRotate: false,
    });
  });

  it("refuses Undo after 30 seconds", async () => {
    const { as, groupId } = await createGroup();
    await as.mutation(api.groups.rotateShareToken, { groupId });
    vi.advanceTimersByTime(30_001);

    expect((await as.query(api.groups.get, { groupId }))?.canUndoRotate).toBe(false);
    await expectErrorCode(
      as.mutation(api.groups.undoRotateShareToken, { groupId }),
      "UNDO_EXPIRED",
    );
  });

  it("stops the old Share Link, and Undo brings it back", async () => {
    const { as, groupId, shareToken } = await createGroup();
    const resolve = (token: string) =>
      t.run(async (ctx) => (await groupByShareToken(ctx, token))?._id ?? null);

    await as.mutation(api.groups.rotateShareToken, { groupId });
    const rotated = (await readGroup(groupId))!.shareToken;
    expect(await resolve(shareToken)).toBeNull();
    expect(await resolve(rotated)).toBe(groupId);

    await as.mutation(api.groups.undoRotateShareToken, { groupId });
    expect(await resolve(shareToken)).toBe(groupId);
    expect(await resolve(rotated)).toBeNull();
  });

  it("forgets the Undo once its 30 seconds pass, so an open view stops offering it", async () => {
    const { as, groupId } = await createGroup();
    await as.mutation(api.groups.rotateShareToken, { groupId });

    vi.advanceTimersByTime(30_001);
    await t.finishInProgressScheduledFunctions();

    const group = await readGroup(groupId);
    expect(group?.previousShareToken).toBeUndefined();
    expect(group?.shareTokenRotatedAt).toBeUndefined();
  });

  it("keeps the Undo of a newer rotation when an older one's 30 seconds pass", async () => {
    const { as, groupId } = await createGroup();
    await as.mutation(api.groups.rotateShareToken, { groupId });
    vi.advanceTimersByTime(20_000);
    await as.mutation(api.groups.rotateShareToken, { groupId });

    vi.advanceTimersByTime(10_001);
    await t.finishInProgressScheduledFunctions();

    expect((await as.query(api.groups.get, { groupId }))?.canUndoRotate).toBe(true);
  });

  it("refuses Undo when nothing was rotated", async () => {
    const { as, groupId } = await createGroup();

    await expectErrorCode(
      as.mutation(api.groups.undoRotateShareToken, { groupId }),
      "UNDO_EXPIRED",
    );
  });

  it("refuses a second Undo", async () => {
    const { as, groupId } = await createGroup();
    await as.mutation(api.groups.rotateShareToken, { groupId });
    await as.mutation(api.groups.undoRotateShareToken, { groupId });

    await expectErrorCode(
      as.mutation(api.groups.undoRotateShareToken, { groupId }),
      "UNDO_EXPIRED",
    );
  });

  it("refuses Undo when another Group took the old Share Token meanwhile", async () => {
    const { as, userId, groupId, shareToken } = await createGroup();
    await as.mutation(api.groups.rotateShareToken, { groupId });
    await t.run(async (ctx) => {
      const otherGroupId = await insertGroup(ctx, (await ctx.db.get("users", userId))!);
      await ctx.db.patch("groups", otherGroupId, { shareToken });
    });

    await expectErrorCode(
      as.mutation(api.groups.undoRotateShareToken, { groupId }),
      "UNDO_EXPIRED",
    );
  });

  it("treats a Group the caller does not own as missing", async () => {
    const { groupId } = await createGroup();
    const stranger = await signInAccount(t);

    await expectErrorCode(
      stranger.as.mutation(api.groups.rotateShareToken, { groupId }),
      "NOT_FOUND",
    );
    await expectErrorCode(
      stranger.as.mutation(api.groups.undoRotateShareToken, { groupId }),
      "NOT_FOUND",
    );
  });

  it("rejects a signed-out caller", async () => {
    const { groupId } = await createGroup();

    await expectErrorCode(t.mutation(api.groups.rotateShareToken, { groupId }), "UNAUTHENTICATED");
    await expectErrorCode(
      t.mutation(api.groups.undoRotateShareToken, { groupId }),
      "UNAUTHENTICATED",
    );
  });
});
