import { beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  findPlayerOnShareLink,
  groupByShareToken,
  ownedPlayer,
  ownedSession,
  playerOnShareLink,
} from "./access";
import { insertGroup } from "./groups";
import {
  expectErrorCode,
  newBackend,
  seedSession,
  signInAccount,
  type TestBackend,
} from "./test.setup";

let t: TestBackend;

beforeEach(() => {
  t = newBackend();
});

async function seedGroupWithPlayer(ownerId: Id<"users">) {
  return await t.run(async (ctx) => {
    const groupId = await insertGroup(ctx, (await ctx.db.get("users", ownerId))!);
    const playerId = await ctx.db.insert("players", { groupId, name: "Ada", nameKey: "ada" });
    const { shareToken } = (await ctx.db.get("groups", groupId))!;
    return { groupId, playerId, shareToken };
  });
}

async function deletePlayer(playerId: Id<"players">) {
  await t.run(async (ctx) => await ctx.db.delete("players", playerId));
}

describe("groupByShareToken", () => {
  it("finds the Group behind its Share Token and nothing behind an unknown one", async () => {
    const { userId } = await signInAccount(t);
    const { groupId, shareToken } = await seedGroupWithPlayer(userId);

    await t.run(async (ctx) => {
      expect((await groupByShareToken(ctx, shareToken))?._id).toBe(groupId);
      expect(await groupByShareToken(ctx, "unknownTok")).toBeNull();
    });
  });
});

describe("playerOnShareLink", () => {
  it("returns the Group and the Player when the Player belongs to it", async () => {
    const { userId } = await signInAccount(t);
    const { groupId, playerId, shareToken } = await seedGroupWithPlayer(userId);

    const found = await t.run(async (ctx) => await playerOnShareLink(ctx, shareToken, playerId));

    expect(found.group._id).toBe(groupId);
    expect(found.player._id).toBe(playerId);
  });

  it("treats a Player of another Group as missing", async () => {
    const { userId } = await signInAccount(t);
    const { shareToken } = await seedGroupWithPlayer(userId);
    const other = await seedGroupWithPlayer(userId);

    await expectErrorCode(
      t.run(async (ctx) => await playerOnShareLink(ctx, shareToken, other.playerId)),
      "NOT_FOUND",
    );
  });

  it("treats an unknown Share Token as missing", async () => {
    const { userId } = await signInAccount(t);
    const { playerId } = await seedGroupWithPlayer(userId);

    await expectErrorCode(
      t.run(async (ctx) => await playerOnShareLink(ctx, "unknownTok", playerId)),
      "NOT_FOUND",
    );
  });
});

describe("findPlayerOnShareLink", () => {
  it("returns the Player when it belongs to the Group behind the Share Token", async () => {
    const { userId } = await signInAccount(t);
    const { playerId, shareToken } = await seedGroupWithPlayer(userId);

    const player = await t.run(
      async (ctx) => await findPlayerOnShareLink(ctx, shareToken, playerId),
    );

    expect(player?._id).toBe(playerId);
  });

  it("returns nothing for a Player of another Group, an unknown token, or a malformed id", async () => {
    const { userId } = await signInAccount(t);
    const { playerId, shareToken } = await seedGroupWithPlayer(userId);
    const other = await seedGroupWithPlayer(userId);

    await t.run(async (ctx) => {
      expect(await findPlayerOnShareLink(ctx, shareToken, other.playerId)).toBeNull();
      expect(await findPlayerOnShareLink(ctx, "unknownTok", playerId)).toBeNull();
      expect(await findPlayerOnShareLink(ctx, shareToken, "not-an-id")).toBeNull();
    });
  });
});

describe("ownedPlayer", () => {
  it("returns the GM, the Group and the Player when the caller owns the Player's Group", async () => {
    const { userId, as } = await signInAccount(t);
    const { groupId, playerId } = await seedGroupWithPlayer(userId);

    const owned = await as.run(async (ctx) => await ownedPlayer(ctx, playerId));

    expect(owned.gm._id).toBe(userId);
    expect(owned.group._id).toBe(groupId);
    expect(owned.player._id).toBe(playerId);
  });

  it("treats a Player of another GM's Group as missing", async () => {
    const { as } = await signInAccount(t);
    const stranger = await signInAccount(t);
    const { playerId } = await seedGroupWithPlayer(stranger.userId);

    await expectErrorCode(
      as.run(async (ctx) => await ownedPlayer(ctx, playerId)),
      "NOT_FOUND",
    );
  });

  it("treats a removed Player as missing", async () => {
    const { userId, as } = await signInAccount(t);
    const { playerId } = await seedGroupWithPlayer(userId);
    await deletePlayer(playerId);

    await expectErrorCode(
      as.run(async (ctx) => await ownedPlayer(ctx, playerId)),
      "NOT_FOUND",
    );
  });

  it("refuses a caller who is not signed in", async () => {
    const { userId } = await signInAccount(t);
    const { playerId } = await seedGroupWithPlayer(userId);

    await expectErrorCode(
      t.run(async (ctx) => await ownedPlayer(ctx, playerId)),
      "UNAUTHENTICATED",
    );
  });
});

describe("ownedSession", () => {
  it("returns the GM, the Group and the Session when the caller owns the Session's Group", async () => {
    const { userId, as } = await signInAccount(t);
    const { groupId } = await seedGroupWithPlayer(userId);
    const sessionId = await seedSession(t, groupId, "2026-10-17");

    const owned = await as.run(async (ctx) => await ownedSession(ctx, sessionId));

    expect(owned.gm._id).toBe(userId);
    expect(owned.group._id).toBe(groupId);
    expect(owned.session._id).toBe(sessionId);
  });

  it("treats a Session of another GM's Group as missing", async () => {
    const { as } = await signInAccount(t);
    const stranger = await signInAccount(t);
    const { groupId } = await seedGroupWithPlayer(stranger.userId);
    const sessionId = await seedSession(t, groupId, "2026-10-17");

    await expectErrorCode(
      as.run(async (ctx) => await ownedSession(ctx, sessionId)),
      "NOT_FOUND",
    );
  });

  it("refuses a caller who is not signed in", async () => {
    const { userId } = await signInAccount(t);
    const { groupId } = await seedGroupWithPlayer(userId);
    const sessionId = await seedSession(t, groupId, "2026-10-17");

    await expectErrorCode(
      t.run(async (ctx) => await ownedSession(ctx, sessionId)),
      "UNAUTHENTICATED",
    );
  });
});
