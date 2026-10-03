import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectErrorCode,
  expiryOf,
  newBackend,
  signedInGmWithGroup,
  signInAccount,
  signInAnonymousGm,
  spendGmEdits,
  type TestBackend,
} from "./model/test.setup";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 12);

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function rosterOf(groupId: Id<"groups">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("players")
        .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
        .collect()
    ).map(({ name, nameKey }) => ({ name, nameKey })),
  );
}

async function seedPlayers(groupId: Id<"groups">, count: number) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index++) {
      await ctx.db.insert("players", { groupId, name: `P${index}`, nameKey: `p${index}` });
    }
  });
}

async function answersOf(playerId: Id<"players">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("answers")
        .withIndex("by_playerId_and_date", (q) => q.eq("playerId", playerId))
        .collect(),
  );
}

async function seedAnswers(groupId: Id<"groups">, playerId: Id<"players">, dates: string[]) {
  await t.run(async (ctx) => {
    for (const date of dates) {
      await ctx.db.insert("answers", { groupId, playerId, date, answer: "free" });
    }
  });
}

async function aForeignGroup() {
  const stranger = await signedInGmWithGroup(t);
  const playerId = await stranger.as.mutation(api.roster.addPlayer, {
    groupId: stranger.groupId,
    name: "Their player",
  });
  return { groupId: stranger.groupId, playerId };
}

describe("roster.addPlayer", () => {
  it("adds a Player with the normalized name", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    await as.mutation(api.roster.addPlayer, { groupId, name: "  Ada   Lovelace " });

    expect(await rosterOf(groupId)).toEqual([{ name: "Ada Lovelace", nameKey: "ada lovelace" }]);
  });

  it("returns the new Player's id", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    const playerId = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });

    const player = await t.run(async (ctx) => await ctx.db.get("players", playerId));
    expect(player).toMatchObject({ groupId, name: "Ada" });
  });

  it.each(["", "   ", "x".repeat(61)])("rejects the invalid name %j", async (name) => {
    const { as, groupId } = await signedInGmWithGroup(t);

    await expectErrorCode(as.mutation(api.roster.addPlayer, { groupId, name }), "INVALID_NAME");
    expect(await rosterOf(groupId)).toEqual([]);
  });

  it("rejects a name already on the Roster, ignoring case, and names the existing Player", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });

    const error = await expectErrorCode(
      as.mutation(api.roster.addPlayer, { groupId, name: " ADA " }),
      "NAME_TAKEN",
    );

    expect(error.playerId).toBe(ada);
    expect(await rosterOf(groupId)).toHaveLength(1);
  });

  it("allows the same name in another Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const otherGroupId = await as.mutation(api.groups.create, {});
    await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });

    await as.mutation(api.roster.addPlayer, { groupId: otherGroupId, name: "Ada" });

    expect(await rosterOf(otherGroupId)).toEqual([{ name: "Ada", nameKey: "ada" }]);
  });

  it("caps the Roster at 100 Players", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    await seedPlayers(groupId, 99);
    await as.mutation(api.roster.addPlayer, { groupId, name: "Last seat" });

    await expectErrorCode(
      as.mutation(api.roster.addPlayer, { groupId, name: "One too many" }),
      "ROSTER_FULL",
    );
    expect(await rosterOf(groupId)).toHaveLength(100);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(t, signInAnonymousGm);
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });

  it("treats a foreign Group as missing", async () => {
    const { as } = await signedInGmWithGroup(t);
    const foreign = await aForeignGroup();

    await expectErrorCode(
      as.mutation(api.roster.addPlayer, { groupId: foreign.groupId, name: "Mallory" }),
      "NOT_FOUND",
    );
    expect(await rosterOf(foreign.groupId)).toEqual([
      { name: "Their player", nameKey: "their player" },
    ]);
  });

  it("rejects a signed-out caller", async () => {
    const { groupId } = await signedInGmWithGroup(t);

    await expectErrorCode(
      t.mutation(api.roster.addPlayer, { groupId, name: "Ada" }),
      "UNAUTHENTICATED",
    );
  });
});

describe("roster.renamePlayer", () => {
  async function gmWithPlayer(signInGm = signInAccount) {
    const gm = await signedInGmWithGroup(t, signInGm);
    const playerId = await gm.as.mutation(api.roster.addPlayer, {
      groupId: gm.groupId,
      name: "Ada",
    });
    return { ...gm, playerId };
  }

  it("renames the Player with the normalized name", async () => {
    const { as, groupId, playerId } = await gmWithPlayer();

    await as.mutation(api.roster.renamePlayer, { playerId, name: " Ada  King " });

    expect(await rosterOf(groupId)).toEqual([{ name: "Ada King", nameKey: "ada king" }]);
  });

  it("keeps the Player's id and Answers", async () => {
    const { as, groupId, playerId } = await gmWithPlayer();
    await seedAnswers(groupId, playerId, ["2026-10-03", "2026-10-17"]);

    await as.mutation(api.roster.renamePlayer, { playerId, name: "Ada King" });

    const player = await t.run(async (ctx) => await ctx.db.get("players", playerId));
    expect(player?.name).toBe("Ada King");
    expect(await answersOf(playerId)).toHaveLength(2);
  });

  it("lets a Player change only the case of their own name", async () => {
    const { as, groupId, playerId } = await gmWithPlayer();

    await as.mutation(api.roster.renamePlayer, { playerId, name: "ADA" });

    expect(await rosterOf(groupId)).toEqual([{ name: "ADA", nameKey: "ada" }]);
  });

  it("rejects an invalid name", async () => {
    const { as, groupId, playerId } = await gmWithPlayer();

    await expectErrorCode(
      as.mutation(api.roster.renamePlayer, { playerId, name: " " }),
      "INVALID_NAME",
    );
    expect(await rosterOf(groupId)).toEqual([{ name: "Ada", nameKey: "ada" }]);
  });

  it("rejects the name of another Player on the Roster", async () => {
    const { as, groupId, playerId } = await gmWithPlayer();
    const grace = await as.mutation(api.roster.addPlayer, { groupId, name: "Grace" });

    const error = await expectErrorCode(
      as.mutation(api.roster.renamePlayer, { playerId, name: "grace" }),
      "NAME_TAKEN",
    );

    expect(error.playerId).toBe(grace);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId, playerId } = await gmWithPlayer(signInAnonymousGm);
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.roster.renamePlayer, { playerId, name: "Ada King" });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });

  it("treats a Player of a foreign Group as missing", async () => {
    const { as } = await gmWithPlayer();
    const foreign = await aForeignGroup();

    await expectErrorCode(
      as.mutation(api.roster.renamePlayer, { playerId: foreign.playerId, name: "Mallory" }),
      "NOT_FOUND",
    );
    expect(await rosterOf(foreign.groupId)).toEqual([
      { name: "Their player", nameKey: "their player" },
    ]);
  });

  it("treats a removed Player as missing", async () => {
    const { as, playerId } = await gmWithPlayer();
    await as.mutation(api.roster.removePlayer, { playerId });

    await expectErrorCode(
      as.mutation(api.roster.renamePlayer, { playerId, name: "Ada King" }),
      "NOT_FOUND",
    );
  });

  it("rejects a signed-out caller", async () => {
    const { playerId } = await gmWithPlayer();

    await expectErrorCode(
      t.mutation(api.roster.renamePlayer, { playerId, name: "Ada King" }),
      "UNAUTHENTICATED",
    );
  });
});

describe("roster.removePlayer", () => {
  it("removes the Player and every Answer they gave", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    const grace = await as.mutation(api.roster.addPlayer, { groupId, name: "Grace" });
    await seedAnswers(groupId, ada, ["2026-09-30", "2026-10-03", "2026-12-31"]);
    await seedAnswers(groupId, grace, ["2026-10-03"]);

    await as.mutation(api.roster.removePlayer, { playerId: ada });

    expect(await rosterOf(groupId)).toEqual([{ name: "Grace", nameKey: "grace" }]);
    expect(await answersOf(ada)).toEqual([]);
    expect(await answersOf(grace)).toHaveLength(1);
  });

  it("frees the name for a new Player", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    await as.mutation(api.roster.removePlayer, { playerId: ada });

    await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });

    expect(await rosterOf(groupId)).toEqual([{ name: "Ada", nameKey: "ada" }]);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(t, signInAnonymousGm);
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.roster.removePlayer, { playerId: ada });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });

  it("treats a Player of a foreign Group as missing", async () => {
    const { as } = await signedInGmWithGroup(t);
    const foreign = await aForeignGroup();

    await expectErrorCode(
      as.mutation(api.roster.removePlayer, { playerId: foreign.playerId }),
      "NOT_FOUND",
    );
    expect(await rosterOf(foreign.groupId)).toHaveLength(1);
  });

  it("treats an already removed Player as missing", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    await as.mutation(api.roster.removePlayer, { playerId: ada });

    await expectErrorCode(as.mutation(api.roster.removePlayer, { playerId: ada }), "NOT_FOUND");
  });

  it("rejects a signed-out caller", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });

    await expectErrorCode(
      t.mutation(api.roster.removePlayer, { playerId: ada }),
      "UNAUTHENTICATED",
    );
  });
});

describe("the GM edit limit", () => {
  it("refuses every Roster edit once the GM's edits are spent, and changes nothing", async () => {
    const { as, groupId, userId } = await signedInGmWithGroup(t);
    const playerId = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    await spendGmEdits(t, userId);

    await expectErrorCode(
      as.mutation(api.roster.addPlayer, { groupId, name: "Bo" }),
      "RATE_LIMITED",
    );
    await expectErrorCode(
      as.mutation(api.roster.renamePlayer, { playerId, name: "Cy" }),
      "RATE_LIMITED",
    );
    await expectErrorCode(as.mutation(api.roster.removePlayer, { playerId }), "RATE_LIMITED");
    expect(await rosterOf(groupId)).toEqual([{ name: "Ada", nameKey: "ada" }]);
  });
});
