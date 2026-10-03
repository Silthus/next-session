import { beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { groupByShareToken, playerOnShareLink } from "./access";
import { insertGroup } from "./groups";
import { expectErrorCode, newBackend, signInAccount, type TestBackend } from "./test.setup";

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

describe("groupByShareToken", () => {
  it("finds the Group behind its current Share Token only", async () => {
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
