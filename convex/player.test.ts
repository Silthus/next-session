import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { AppErrorData } from "./model/errors";
import {
  expectErrorCode,
  expiryOf,
  type GmClient,
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signInAccount,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 3, 23, 30);
const TODAY = "2026-10-03";
const LAST_BOOKABLE_DATE = "2026-12-31";

const LIMITER_SHARD_SEED = 34;

let t: TestBackend;

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockImplementation(seededRandom(LIMITER_SHARD_SEED));
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function sharedGroup(signInGm = signInAccount) {
  const gm = await signedInGmWithGroup(t, signInGm);
  return { ...gm, shareToken: await shareTokenOf(gm.groupId) };
}

async function shareTokenOf(groupId: Id<"groups">) {
  const group = await t.run(async (ctx) => await ctx.db.get("groups", groupId));
  if (group === null) throw new Error("Group is gone");
  return group.shareToken;
}

async function seedPlayer(groupId: Id<"groups">, name: string) {
  return await t.run(
    async (ctx) => await ctx.db.insert("players", { groupId, name, nameKey: name.toLowerCase() }),
  );
}

async function seedPlayers(groupId: Id<"groups">, count: number) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index++) {
      await ctx.db.insert("players", { groupId, name: `P${index}`, nameKey: `p${index}` });
    }
  });
}

async function seedAnswer(
  groupId: Id<"groups">,
  playerId: Id<"players">,
  date: string,
  answer: "free" | "maybe" | "busy",
) {
  await t.run(async (ctx) => await ctx.db.insert("answers", { groupId, playerId, date, answer }));
}

async function answersOf(playerId: Id<"players">) {
  const rows = await t.run(
    async (ctx) =>
      await ctx.db
        .query("answers")
        .withIndex("by_playerId_and_date", (q) => q.eq("playerId", playerId))
        .collect(),
  );
  return Object.fromEntries(rows.map((row) => [row.date, row.answer]));
}

async function rosterNamesOf(groupId: Id<"groups">) {
  const players = await t.run(
    async (ctx) =>
      await ctx.db
        .query("players")
        .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
        .collect(),
  );
  return players.map((player) => player.name);
}

async function rotatedAway(groupId: Id<"groups">, as: GmClient) {
  const oldShareToken = await shareTokenOf(groupId);
  await as.mutation(api.groups.rotateShareToken, { groupId });
  return oldShareToken;
}

const GROUP_ANSWER_BURST = 300;
const LEAST_SHARDED_GROUP_BURST = 250;
const PLAYERS_SHARING_THE_BURST = 6;

async function acceptedUntilTheGroupRefuses(
  groupId: Id<"groups">,
  act: (playerId: Id<"players">) => Promise<unknown>,
) {
  const players: Id<"players">[] = [];
  for (let index = 0; index < PLAYERS_SHARING_THE_BURST; index++) {
    players.push(await seedPlayer(groupId, `Tapper ${index}`));
  }
  for (let accepted = 0; accepted <= GROUP_ANSWER_BURST; accepted++) {
    try {
      await act(players[accepted % players.length]!);
    } catch (error) {
      if (error instanceof ConvexError && (error.data as AppErrorData).code === "RATE_LIMITED") {
        return accepted;
      }
      throw error;
    }
  }
  return Infinity;
}

function datesFrom(first: number, last: number, month = "2026-10") {
  return Array.from(
    { length: last - first + 1 },
    (_, index) => `${month}-${String(first + index).padStart(2, "0")}`,
  );
}

describe("player.group", () => {
  it("shows the Group's name, its Roster, and every Session date", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const bo = await seedPlayer(groupId, "Bo");
    const ada = await seedPlayer(groupId, "Ada");
    for (const date of ["2026-10-02", TODAY, "2026-10-17", LAST_BOOKABLE_DATE, "2027-01-01"]) {
      await seedSession(t, groupId, date);
    }

    expect(await t.query(api.player.group, { shareToken })).toEqual({
      groupId,
      name: "My group",
      players: [
        { _id: ada, name: "Ada" },
        { _id: bo, name: "Bo" },
      ],
      sessionDates: ["2026-10-02", TODAY, "2026-10-17", LAST_BOOKABLE_DATE, "2027-01-01"],
      claimedPlayerId: null,
      removedFromMyGroups: false,
    });
  });

  it("shows the Account's Claimed Player on its other devices and to no one else", async () => {
    const { as: gm, shareToken } = await sharedGroup();
    const player = await signInAccount(t);
    const ada = await player.as.mutation(api.player.join, { shareToken, name: "Ada" });
    const otherSessionId = await t.run(
      async (ctx) =>
        await ctx.db.insert("authSessions", {
          userId: player.userId,
          expirationTime: Date.now() + DAY,
        }),
    );
    const otherDevice = t.withIdentity({ subject: `${player.userId}|${otherSessionId}` });
    const anonymousGm = await signInAnonymousGm(t);

    expect(await claimedPlayerIdIn(otherDevice, shareToken)).toBe(ada);
    for (const stranger of [t, gm, anonymousGm.as, (await signInAccount(t)).as]) {
      expect(await claimedPlayerIdIn(stranger, shareToken)).toBeNull();
    }
  });

  it("shows only the Group behind the Share Token", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    await seedPlayer(other.groupId, "Stranger");
    await seedSession(t, other.groupId, "2026-10-17");

    expect(await t.query(api.player.group, { shareToken: mine.shareToken })).toMatchObject({
      groupId: mine.groupId,
      players: [],
      sessionDates: [],
    });
  });

  it.each(["", "unknown123", "toolongtoken123456"])(
    "returns null for the unknown Share Token %j",
    async (shareToken) => {
      await sharedGroup();

      expect(await t.query(api.player.group, { shareToken })).toBeNull();
    },
  );

  it("returns null for a Share Token the GM rotated away, even while Undo is open", async () => {
    const { as, groupId } = await sharedGroup();
    const oldShareToken = await rotatedAway(groupId, as);

    expect(await t.query(api.player.group, { shareToken: oldShareToken })).toBeNull();
    expect(
      await t.query(api.player.group, { shareToken: await shareTokenOf(groupId) }),
    ).toMatchObject({ groupId });
  });
});

describe("player.answers", () => {
  it("returns the Player's Answers of the month by date", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    await seedAnswer(groupId, ada, "2026-10-01", "maybe");
    await seedAnswer(groupId, ada, "2026-10-31", "free");
    await seedAnswer(groupId, ada, "2026-11-01", "busy");
    await seedAnswer(groupId, ada, "2026-09-30", "busy");
    await seedAnswer(groupId, bo, "2026-10-05", "free");

    expect(
      await t.query(api.player.answers, { shareToken, playerId: ada, month: "2026-10" }),
    ).toEqual({ "2026-10-01": "maybe", "2026-10-31": "free" });
  });

  it("still shows the Answers of a past month", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    await seedAnswer(groupId, ada, "2026-09-12", "free");

    expect(
      await t.query(api.player.answers, { shareToken, playerId: ada, month: "2026-09" }),
    ).toEqual({ "2026-09-12": "free" });
  });

  it("never reads a Player of another Group through this Share Token", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    const stranger = await seedPlayer(other.groupId, "Stranger");
    await seedAnswer(other.groupId, stranger, "2026-10-05", "free");

    expect(
      await t.query(api.player.answers, {
        shareToken: mine.shareToken,
        playerId: stranger,
        month: "2026-10",
      }),
    ).toBeNull();
  });

  it("returns null for an unknown or rotated-away Share Token", async () => {
    const { as, groupId } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const oldShareToken = await rotatedAway(groupId, as);

    for (const shareToken of ["unknown123", oldShareToken]) {
      expect(
        await t.query(api.player.answers, { shareToken, playerId: ada, month: "2026-10" }),
      ).toBeNull();
    }
  });

  it("returns null for a removed Player", async () => {
    const { as, groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    await as.mutation(api.roster.removePlayer, { playerId: ada });

    expect(
      await t.query(api.player.answers, { shareToken, playerId: ada, month: "2026-10" }),
    ).toBeNull();
  });

  it.each([
    { playerId: "not-an-id", month: "2026-10" },
    { playerId: "PLAYER", month: "2026-13" },
    { playerId: "PLAYER", month: "Oct" },
  ])("returns null for the malformed arguments %j", async (args) => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const playerId = args.playerId === "PLAYER" ? ada : args.playerId;

    expect(
      await t.query(api.player.answers, { shareToken, playerId, month: args.month }),
    ).toBeNull();
  });
});

describe("player.join", () => {
  it("adds the Player to the Roster under the normalized name", async () => {
    const { groupId, shareToken } = await sharedGroup();

    const playerId = await t.mutation(api.player.join, { shareToken, name: "  Ada   Lovelace " });

    const player = await t.run(async (ctx) => await ctx.db.get("players", playerId));
    expect(player).toMatchObject({ groupId, name: "Ada Lovelace", nameKey: "ada lovelace" });
  });

  it.each(["", "   ", "x".repeat(61)])("rejects the name %j", async (name) => {
    const { groupId, shareToken } = await sharedGroup();

    await expectErrorCode(t.mutation(api.player.join, { shareToken, name }), "INVALID_NAME");
    expect(await rosterNamesOf(groupId)).toEqual([]);
  });

  it("refuses a name already on the Roster and points at its Player", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");

    const error = await expectErrorCode(
      t.mutation(api.player.join, { shareToken, name: " ADA " }),
      "NAME_TAKEN",
    );

    expect(error.playerId).toBe(ada);
    expect(await rosterNamesOf(groupId)).toEqual(["Ada"]);
  });

  it("lets the same name join two Groups", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    await seedPlayer(other.groupId, "Ada");

    await t.mutation(api.player.join, { shareToken: mine.shareToken, name: "Ada" });

    expect(await rosterNamesOf(mine.groupId)).toEqual(["Ada"]);
  });

  it("refuses a Player beyond 100", async () => {
    const { groupId, shareToken } = await sharedGroup();
    await seedPlayers(groupId, 100);

    await expectErrorCode(t.mutation(api.player.join, { shareToken, name: "Ada" }), "ROSTER_FULL");
    expect(await rosterNamesOf(groupId)).toHaveLength(100);
  });

  it("refuses an unknown or rotated-away Share Token", async () => {
    const { as, groupId } = await sharedGroup();
    const oldShareToken = await rotatedAway(groupId, as);

    for (const shareToken of ["unknown123", oldShareToken]) {
      await expectErrorCode(t.mutation(api.player.join, { shareToken, name: "Ada" }), "NOT_FOUND");
    }
    expect(await rosterNamesOf(groupId)).toEqual([]);
  });

  it("rate limits a Group to 30 joins per hour", async () => {
    const { groupId, shareToken } = await sharedGroup();
    for (let index = 0; index < 30; index++) {
      await t.mutation(api.player.join, { shareToken, name: `P${index}` });
    }

    const error = await expectErrorCode(
      t.mutation(api.player.join, { shareToken, name: "Ada" }),
      "RATE_LIMITED",
    );
    expect(error.retryAfter).toBeGreaterThan(0);
    expect(error.retryAfter).toBeLessThanOrEqual(HOUR);
    expect(await rosterNamesOf(groupId)).toHaveLength(30);

    vi.advanceTimersByTime(error.retryAfter);
    await expect(t.mutation(api.player.join, { shareToken, name: "Ada" })).resolves.toBeDefined();
  });

  it("rate limits each Group separately", async () => {
    const busy = await sharedGroup();
    const quiet = await sharedGroup();
    for (let index = 0; index < 30; index++) {
      await t.mutation(api.player.join, { shareToken: busy.shareToken, name: `P${index}` });
    }

    await expect(
      t.mutation(api.player.join, { shareToken: quiet.shareToken, name: "Ada" }),
    ).resolves.toBeDefined();
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { groupId, shareToken } = await sharedGroup(signInAnonymousGm);
    vi.setSystemTime(NOW + 2 * DAY);

    await t.mutation(api.player.join, { shareToken, name: "Ada" });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });
});

describe("player.answer", () => {
  it("records, changes, and clears the Player's Answer for a date", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const date = "2026-10-17";

    await t.mutation(api.player.answer, { shareToken, playerId: ada, date, answer: "free" });
    expect(await answersOf(ada)).toEqual({ [date]: "free" });

    await t.mutation(api.player.answer, { shareToken, playerId: ada, date, answer: "busy" });
    expect(await answersOf(ada)).toEqual({ [date]: "busy" });

    await t.mutation(api.player.answer, { shareToken, playerId: ada, date, answer: null });
    expect(await answersOf(ada)).toEqual({});
  });

  it("stores the Answer under the Player's Group", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");

    await t.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "maybe",
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("answers").collect());
    expect(rows).toMatchObject([{ groupId, playerId: ada, date: TODAY, answer: "maybe" }]);
  });

  it("clears an unanswered date without complaint", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");

    await t.mutation(api.player.answer, { shareToken, playerId: ada, date: TODAY, answer: null });

    expect(await answersOf(ada)).toEqual({});
  });

  it.each([TODAY, LAST_BOOKABLE_DATE])(
    "accepts %s at the edge of the Booking Window",
    async (date) => {
      const { groupId, shareToken } = await sharedGroup();
      const ada = await seedPlayer(groupId, "Ada");

      await t.mutation(api.player.answer, { shareToken, playerId: ada, date, answer: "free" });

      expect(await answersOf(ada)).toEqual({ [date]: "free" });
    },
  );

  it.each(["2026-10-02", "2027-01-01", "2026-11-31", "2026-10-3", "tomorrow"])(
    "rejects %s outside the Booking Window",
    async (date) => {
      const { groupId, shareToken } = await sharedGroup();
      const ada = await seedPlayer(groupId, "Ada");

      await expectErrorCode(
        t.mutation(api.player.answer, { shareToken, playerId: ada, date, answer: "free" }),
        "OUT_OF_WINDOW",
      );
      expect(await answersOf(ada)).toEqual({});
    },
  );

  it("keeps a past Answer read-only", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    await seedAnswer(groupId, ada, "2026-10-02", "free");

    for (const answer of ["busy", null] as const) {
      await expectErrorCode(
        t.mutation(api.player.answer, { shareToken, playerId: ada, date: "2026-10-02", answer }),
        "OUT_OF_WINDOW",
      );
    }
    expect(await answersOf(ada)).toEqual({ "2026-10-02": "free" });
  });

  it("never writes for a Player of another Group through this Share Token", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    const stranger = await seedPlayer(other.groupId, "Stranger");
    await seedAnswer(other.groupId, stranger, "2026-10-17", "free");

    for (const answer of ["busy", null] as const) {
      await expectErrorCode(
        t.mutation(api.player.answer, {
          shareToken: mine.shareToken,
          playerId: stranger,
          date: "2026-10-17",
          answer,
        }),
        "NOT_FOUND",
      );
    }
    expect(await answersOf(stranger)).toEqual({ "2026-10-17": "free" });
  });

  it("refuses an unknown or rotated-away Share Token", async () => {
    const { as, groupId } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const oldShareToken = await rotatedAway(groupId, as);

    for (const shareToken of ["unknown123", oldShareToken]) {
      await expectErrorCode(
        t.mutation(api.player.answer, { shareToken, playerId: ada, date: TODAY, answer: "free" }),
        "NOT_FOUND",
      );
    }
    expect(await answersOf(ada)).toEqual({});
  });

  it("rate limits a Player to a burst of 60 Answers, refilling 120 per minute", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    const tap = (playerId: Id<"players">) =>
      t.mutation(api.player.answer, { shareToken, playerId, date: TODAY, answer: "free" });
    for (let index = 0; index < 60; index++) await tap(ada);

    const error = await expectErrorCode(tap(ada), "RATE_LIMITED");
    expect(error.retryAfter).toBe(MINUTE / 120);
    await expect(tap(bo)).resolves.toEqual({ keptNow: false });

    vi.advanceTimersByTime(MINUTE / 120);
    await expect(tap(ada)).resolves.toEqual({ keptNow: false });
  });

  it("rate limits a Group to a burst of at most 300 Answers across its Players", async () => {
    const busy = await sharedGroup();
    const quiet = await sharedGroup();
    const tap = (shareToken: string, playerId: Id<"players">) =>
      t.mutation(api.player.answer, { shareToken, playerId, date: TODAY, answer: "free" });

    const accepted = await acceptedUntilTheGroupRefuses(busy.groupId, (playerId) =>
      tap(busy.shareToken, playerId),
    );

    expect(accepted).toBeGreaterThanOrEqual(LEAST_SHARDED_GROUP_BURST);
    expect(accepted).toBeLessThanOrEqual(GROUP_ANSWER_BURST);
    await expect(tap(quiet.shareToken, await seedPlayer(quiet.groupId, "Ada"))).resolves.toEqual({
      keptNow: false,
    });
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { groupId, shareToken } = await sharedGroup(signInAnonymousGm);
    const ada = await seedPlayer(groupId, "Ada");
    vi.setSystemTime(NOW + 2 * DAY);

    await t.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: "2026-10-17",
      answer: "free",
    });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });
});

describe("player.fillRest", () => {
  it("answers busy on every unanswered bookable date of the month", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    await seedAnswer(groupId, ada, "2026-10-01", "maybe");
    await seedAnswer(groupId, ada, "2026-10-10", "free");

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-10" });

    expect(await answersOf(ada)).toEqual({
      ...Object.fromEntries(datesFrom(3, 31).map((date) => [date, "busy"])),
      "2026-10-01": "maybe",
      "2026-10-10": "free",
    });
  });

  it("fills the whole last month of the Booking Window", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-12" });

    expect(Object.keys(await answersOf(ada))).toEqual(datesFrom(1, 31, "2026-12"));
  });

  it("follows the Booking Window across New Year", async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 20, 12));
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2027-01" });

    expect(Object.keys(await answersOf(ada))).toEqual(datesFrom(1, 31, "2027-01"));
    for (const month of ["2026-10", "2027-02"]) {
      await expectErrorCode(
        t.mutation(api.player.fillRest, { shareToken, playerId: ada, month }),
        "OUT_OF_WINDOW",
      );
    }
  });

  it("writes nothing more when called again", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query("answers")
          .withIndex("by_playerId_and_date", (q) => q.eq("playerId", ada))
          .collect(),
    );
    expect(rows).toHaveLength(30);
  });

  it("leaves other Players untouched", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    expect(await answersOf(bo)).toEqual({});
  });

  it.each(["2026-09", "2027-01", "2026-13", "Oct"])(
    "rejects %s outside the Booking Window",
    async (month) => {
      const { groupId, shareToken } = await sharedGroup();
      const ada = await seedPlayer(groupId, "Ada");

      await expectErrorCode(
        t.mutation(api.player.fillRest, { shareToken, playerId: ada, month }),
        "OUT_OF_WINDOW",
      );
      expect(await answersOf(ada)).toEqual({});
    },
  );

  it("never writes for a Player of another Group through this Share Token", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    const stranger = await seedPlayer(other.groupId, "Stranger");

    await expectErrorCode(
      t.mutation(api.player.fillRest, {
        shareToken: mine.shareToken,
        playerId: stranger,
        month: "2026-10",
      }),
      "NOT_FOUND",
    );
    expect(await answersOf(stranger)).toEqual({});
  });

  it("refuses an unknown or rotated-away Share Token", async () => {
    const { as, groupId } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const oldShareToken = await rotatedAway(groupId, as);

    for (const shareToken of ["unknown123", oldShareToken]) {
      await expectErrorCode(
        t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-10" }),
        "NOT_FOUND",
      );
    }
    expect(await answersOf(ada)).toEqual({});
  });

  it("spends one token of the Player's Answer rate limit", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    for (let index = 0; index < 59; index++) {
      await t.mutation(api.player.answer, { shareToken, playerId: ada, date: TODAY, answer: null });
    }
    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    await expectErrorCode(
      t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-12" }),
      "RATE_LIMITED",
    );
    expect(Object.keys(await answersOf(ada)).filter((date) => date >= "2026-12")).toEqual([]);
  });

  it("spends one token of the Group's Answer rate limit, however many dates it fills", async () => {
    const { groupId, shareToken } = await sharedGroup();

    const accepted = await acceptedUntilTheGroupRefuses(groupId, (playerId) =>
      t.mutation(api.player.fillRest, { shareToken, playerId, month: "2026-11" }),
    );

    expect(accepted).toBeGreaterThanOrEqual(LEAST_SHARDED_GROUP_BURST);
    expect(accepted).toBeLessThanOrEqual(GROUP_ANSWER_BURST);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { groupId, shareToken } = await sharedGroup(signInAnonymousGm);
    const ada = await seedPlayer(groupId, "Ada");
    vi.setSystemTime(NOW + 2 * DAY);

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });
});

describe("joining while signed in", () => {
  it("claims the new Player for an Account", async () => {
    const { shareToken } = await sharedGroup();
    const player = await signInAccount(t);

    const ada = await player.as.mutation(api.player.join, { shareToken, name: "Ada" });

    expect(await player.as.query(api.player.group, { shareToken })).toMatchObject({
      claimedPlayerId: ada,
    });
  });

  it("claims nothing for a visitor or an Anonymous GM", async () => {
    const { shareToken } = await sharedGroup();
    const anonymousGm = await signInAnonymousGm(t);

    await t.mutation(api.player.join, { shareToken, name: "Ada" });
    await anonymousGm.as.mutation(api.player.join, { shareToken, name: "Bo" });

    expect(await claimedPlayerIdIn(t, shareToken)).toBeNull();
    expect(await claimedPlayerIdIn(anonymousGm.as, shareToken)).toBeNull();
    const players = await t.run(async (ctx) => await ctx.db.query("players").collect());
    expect(players.map(({ userId }) => userId)).toEqual([undefined, undefined]);
  });

  it("moves the Account's claim in the Group to the new name", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const player = await signInAccount(t);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    const bo = await player.as.mutation(api.player.join, { shareToken, name: "Bo" });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(bo);
    expect(await rosterNamesOf(groupId)).toEqual(["Ada", "Bo"]);
  });

  it("joins no one when the Account already claims 50 Players", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const player = await signInAccount(t);
    await seedClaimsInOtherGroups(player.userId, 50);

    await expectErrorCode(
      player.as.mutation(api.player.join, { shareToken, name: "Ada" }),
      "TOO_MANY_GROUPS",
    );
    expect(await rosterNamesOf(groupId)).toEqual([]);
  });

  it("keeps a joined Player on the Roster until the GM removes it", async () => {
    const { as, groupId, shareToken } = await sharedGroup();
    const player = await signInAccount(t);
    const ada = await player.as.mutation(api.player.join, { shareToken, name: "Ada" });
    await player.as.mutation(api.player.release, { groupId });
    expect(await rosterNamesOf(groupId)).toEqual(["Ada"]);

    await as.mutation(api.roster.removePlayer, { playerId: ada });

    expect(await rosterNamesOf(groupId)).toEqual([]);
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
  });
});

async function claimedPlayerIdIn(as: GmClient, shareToken: string) {
  return (await as.query(api.player.group, { shareToken }))?.claimedPlayerId;
}

async function seedClaimsInOtherGroups(accountId: Id<"users">, count: number) {
  const owner = await signInAccount(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index++) {
      const groupId = await ctx.db.insert("groups", {
        ownerId: owner.userId,
        name: `Table ${index}`,
        shareToken: `table${String(index).padStart(5, "0")}`,
      });
      await ctx.db.insert("players", { groupId, name: "Ada", nameKey: "ada", userId: accountId });
    }
  });
}

describe("player.claim", () => {
  it("claims a Player picked from the Roster", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const player = await signInAccount(t);

    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(ada);
  });

  it("leaves the Account's own claim as it is", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const player = await signInAccount(t);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(ada);
  });

  it("moves the Account's claim to another Player of the same Group", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    const player = await signInAccount(t);
    const other = await signInAccount(t);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    await player.as.mutation(api.player.claim, { shareToken, playerId: bo });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(bo);
    await other.as.mutation(api.player.claim, { shareToken, playerId: ada });
    expect(await claimedPlayerIdIn(other.as, shareToken)).toBe(ada);
  });

  it("refuses a Player another Account claimed", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const first = await signInAccount(t);
    const second = await signInAccount(t);
    await first.as.mutation(api.player.claim, { shareToken, playerId: ada });

    await expectErrorCode(
      second.as.mutation(api.player.claim, { shareToken, playerId: ada }),
      "PLAYER_CLAIMED",
    );
    expect(await claimedPlayerIdIn(first.as, shareToken)).toBe(ada);
    expect(await claimedPlayerIdIn(second.as, shareToken)).toBeNull();
  });

  it("refuses a Player of another Group and a rotated-away Share Token", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    const ada = await seedPlayer(mine.groupId, "Ada");
    const oldShareToken = await rotatedAway(mine.groupId, mine.as);
    const player = await signInAccount(t);

    await expectErrorCode(
      player.as.mutation(api.player.claim, { shareToken: other.shareToken, playerId: ada }),
      "NOT_FOUND",
    );
    await expectErrorCode(
      player.as.mutation(api.player.claim, { shareToken: oldShareToken, playerId: ada }),
      "NOT_FOUND",
    );
    expect(await claimedPlayerIdIn(player.as, await shareTokenOf(mine.groupId))).toBeNull();
  });

  it("lets only an Account claim", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const anonymousGm = await signInAnonymousGm(t);

    for (const caller of [t, anonymousGm.as]) {
      await expectErrorCode(
        caller.mutation(api.player.claim, { shareToken, playerId: ada }),
        "UNAUTHENTICATED",
      );
    }
    const player = await signInAccount(t);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(ada);
  });

  it("caps an Account at 50 Claimed Players but still moves a claim within a Group", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    const player = await signInAccount(t);
    await seedClaimsInOtherGroups(player.userId, 49);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    const full = await sharedGroup();
    const cy = await seedPlayer(full.groupId, "Cy");

    await expectErrorCode(
      player.as.mutation(api.player.claim, { shareToken: full.shareToken, playerId: cy }),
      "TOO_MANY_GROUPS",
    );

    await player.as.mutation(api.player.claim, { shareToken, playerId: bo });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(bo);
  });

  it("rate limits an Account to a burst of 10 claims", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    const player = await signInAccount(t);
    for (let index = 0; index < 10; index++) {
      await player.as.mutation(api.player.claim, { shareToken, playerId: index % 2 ? ada : bo });
    }

    const error = await expectErrorCode(
      player.as.mutation(api.player.claim, { shareToken, playerId: ada }),
      "RATE_LIMITED",
    );
    expect(error.retryAfter).toBeGreaterThan(0);
    expect(error.retryAfter).toBeLessThanOrEqual(MINUTE);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { groupId, shareToken } = await sharedGroup(signInAnonymousGm);
    const ada = await seedPlayer(groupId, "Ada");
    const player = await signInAccount(t);
    vi.setSystemTime(NOW + 2 * DAY);

    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });

  it("locks nothing: the Share Link still answers as a Claimed Player", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const player = await signInAccount(t);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    await t.mutation(api.player.answer, { shareToken, playerId: ada, date: TODAY, answer: "free" });

    expect(await answersOf(ada)).toEqual({ [TODAY]: "free" });
  });
});

describe("player.release", () => {
  it("releases the claim and keeps the Player with its Answers", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const player = await signInAccount(t);
    const ada = await player.as.mutation(api.player.join, { shareToken, name: "Ada" });
    await t.mutation(api.player.answer, { shareToken, playerId: ada, date: TODAY, answer: "free" });

    expect(await player.as.mutation(api.player.release, { groupId })).toBeNull();

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
    expect(await rosterNamesOf(groupId)).toEqual(["Ada"]);
    expect(await answersOf(ada)).toEqual({ [TODAY]: "free" });
    const other = await signInAccount(t);
    await other.as.mutation(api.player.claim, { shareToken, playerId: ada });
    expect(await claimedPlayerIdIn(other.as, shareToken)).toBe(ada);
  });

  it("returns null for a Group without the Account's claim and leaves other claims alone", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const owner = await signedInGmWithGroup(t);
    const someoneElse = await signInAccount(t);
    const ada = await someoneElse.as.mutation(api.player.join, { shareToken, name: "Ada" });
    const player = await signInAccount(t);
    await owner.as.mutation(api.groups.remove, { groupId: owner.groupId });

    for (const anyGroupId of [groupId, owner.groupId]) {
      expect(await player.as.mutation(api.player.release, { groupId: anyGroupId })).toBeNull();
    }
    expect(await claimedPlayerIdIn(someoneElse.as, shareToken)).toBe(ada);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { groupId, shareToken } = await sharedGroup(signInAnonymousGm);
    const player = await signInAccount(t);
    await player.as.mutation(api.player.join, { shareToken, name: "Ada" });
    vi.setSystemTime(NOW + 2 * DAY);

    await player.as.mutation(api.player.release, { groupId });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });

  it("lets only an Account release", async () => {
    const { groupId } = await sharedGroup();
    const anonymousGm = await signInAnonymousGm(t);

    for (const caller of [t, anonymousGm.as]) {
      await expectErrorCode(caller.mutation(api.player.release, { groupId }), "UNAUTHENTICATED");
    }
  });

  it("shares the claim rate limit with player.claim", async () => {
    const { groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const player = await signInAccount(t);
    for (let index = 0; index < 5; index++) {
      await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
      await player.as.mutation(api.player.release, { groupId });
    }

    await expectErrorCode(player.as.mutation(api.player.release, { groupId }), "RATE_LIMITED");
  });
});

describe("keeping the Group on an answer", () => {
  async function pickedPlayer() {
    const group = await sharedGroup();
    const ada = await seedPlayer(group.groupId, "Ada");
    return { ...group, ada, player: await signInAccount(t) };
  }

  it("keeps an Account's picked Player on its first answer, and only then", async () => {
    const { shareToken, ada, player } = await pickedPlayer();

    const first = await player.as.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "free",
    });
    const second = await player.as.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "maybe",
    });

    expect(first).toEqual({ keptNow: true });
    expect(second).toEqual({ keptNow: false });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(ada);
  });

  it("keeps an Account's picked Player on Fill the rest", async () => {
    const { shareToken, ada, player } = await pickedPlayer();

    const filled = await player.as.mutation(api.player.fillRest, {
      shareToken,
      playerId: ada,
      month: "2026-10",
    });

    expect(filled).toEqual({ keptNow: true });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(ada);
  });

  it("keeps nothing while the Account only views the link", async () => {
    const { shareToken, ada, player } = await pickedPlayer();

    await player.as.query(api.player.group, { shareToken });
    await player.as.query(api.player.answers, { shareToken, playerId: ada, month: "2026-10" });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
  });

  it("keeps nothing for a visitor or an Anonymous GM", async () => {
    const { shareToken, ada } = await pickedPlayer();
    const anonymousGm = await signInAnonymousGm(t);

    for (const caller of [t, anonymousGm.as]) {
      const result = await caller.mutation(api.player.answer, {
        shareToken,
        playerId: ada,
        date: TODAY,
        answer: "free",
      });
      expect(result).toEqual({ keptNow: false });
    }
    const players = await t.run(async (ctx) => await ctx.db.query("players").collect());
    expect(players.map(({ userId }) => userId)).toEqual([undefined]);
  });

  it("keeps the GM only once they answer on their own link", async () => {
    const { as, shareToken, ada } = await pickedPlayer();

    const result = await as.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "free",
    });

    expect(result).toEqual({ keptNow: true });
    expect(await claimedPlayerIdIn(as, shareToken)).toBe(ada);
  });

  it("saves the answer and leaves another Account's Player with them", async () => {
    const { shareToken, ada, player } = await pickedPlayer();
    const other = await signInAccount(t);
    await other.as.mutation(api.player.claim, { shareToken, playerId: ada });

    const result = await player.as.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "free",
    });

    expect(result).toEqual({ keptNow: false });
    expect(await answersOf(ada)).toEqual({ [TODAY]: "free" });
    expect(await claimedPlayerIdIn(other.as, shareToken)).toBe(ada);
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
  });

  it("moves the Account's claim to the Player they answer as", async () => {
    const { groupId, shareToken, ada, player } = await pickedPlayer();
    const bo = await seedPlayer(groupId, "Bo");
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    await player.as.mutation(api.player.answer, {
      shareToken,
      playerId: bo,
      date: TODAY,
      answer: "free",
    });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(bo);
  });

  it("saves the answer but keeps nothing past 50 Claimed Players", async () => {
    const { shareToken, ada, player } = await pickedPlayer();
    await seedClaimsInOtherGroups(player.userId, 50);

    const result = await player.as.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "free",
    });

    expect(result).toEqual({ keptNow: false });
    expect(await answersOf(ada)).toEqual({ [TODAY]: "free" });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
  });

  it("keeps again after Not you? and the next answer", async () => {
    const { groupId, shareToken, ada, player } = await pickedPlayer();
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    await player.as.mutation(api.player.release, { groupId });

    await player.as.mutation(api.player.answer, {
      shareToken,
      playerId: ada,
      date: TODAY,
      answer: "free",
    });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBe(ada);
  });
});

describe("player.removeFromMyGroups", () => {
  async function keptPlayer() {
    const { as, groupId, shareToken } = await sharedGroup();
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    const player = await signInAccount(t);
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    return { gm: as, groupId, shareToken, ada, bo, player };
  }

  async function answerAs(as: GmClient, shareToken: string, playerId: Id<"players">) {
    return await as.mutation(api.player.answer, {
      shareToken,
      playerId,
      date: TODAY,
      answer: "free",
    });
  }

  it("releases the claim and keeps the Player with its Answers", async () => {
    const { groupId, shareToken, ada, player } = await keptPlayer();
    await answerAs(player.as, shareToken, ada);

    expect(await player.as.mutation(api.player.removeFromMyGroups, { groupId })).toBeNull();

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
    expect(await rosterNamesOf(groupId)).toEqual(["Ada", "Bo"]);
    expect(await answersOf(ada)).toEqual({ [TODAY]: "free" });
  });

  it("keeps the Group out of My groups when the Account answers again, as any Player", async () => {
    const { groupId, shareToken, ada, bo, player } = await keptPlayer();
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });

    expect(await answerAs(player.as, shareToken, ada)).toEqual({ keptNow: false });
    expect(await answerAs(player.as, shareToken, bo)).toEqual({ keptNow: false });
    await player.as.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-10" });

    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
  });

  it("forgets the removal once the Account keeps the Group on purpose", async () => {
    const { groupId, shareToken, ada, player } = await keptPlayer();
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    await player.as.mutation(api.player.release, { groupId });

    expect(await answerAs(player.as, shareToken, ada)).toEqual({ keptNow: true });
  });

  it("forgets the removal when the Account joins the Group with a new name", async () => {
    const { groupId, shareToken, player } = await keptPlayer();
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });

    const cy = await player.as.mutation(api.player.join, { shareToken, name: "Cy" });
    await player.as.mutation(api.player.release, { groupId });

    expect(await answerAs(player.as, shareToken, cy)).toEqual({ keptNow: true });
  });

  it("removes the Group for this Account only", async () => {
    const { groupId, shareToken, bo, player } = await keptPlayer();
    const other = await signInAccount(t);
    const elsewhere = await sharedGroup();
    const dee = await seedPlayer(elsewhere.groupId, "Dee");
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });

    expect(await answerAs(other.as, shareToken, bo)).toEqual({ keptNow: true });
    expect(await answerAs(player.as, elsewhere.shareToken, dee)).toEqual({ keptNow: true });
  });

  it("remembers both Accounts' removals when they used the same Player", async () => {
    const { groupId, shareToken, ada, player } = await keptPlayer();
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });
    const other = await signInAccount(t);
    await other.as.mutation(api.player.claim, { shareToken, playerId: ada });
    await other.as.mutation(api.player.removeFromMyGroups, { groupId });

    expect(await answerAs(player.as, shareToken, ada)).toEqual({ keptNow: false });
    expect(await answerAs(other.as, shareToken, ada)).toEqual({ keptNow: false });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
    expect(await claimedPlayerIdIn(other.as, shareToken)).toBeNull();
  });

  it("remembers Remove after the GM removes the Player", async () => {
    const { gm, groupId, shareToken, ada, bo, player } = await keptPlayer();
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });
    await gm.mutation(api.roster.removePlayer, { playerId: ada });

    expect(await answerAs(player.as, shareToken, bo)).toEqual({ keptNow: false });
    expect(await claimedPlayerIdIn(player.as, shareToken)).toBeNull();
  });

  it("reports the Group opt-out only to the Account that deliberately removed it", async () => {
    const { groupId, shareToken, ada, player } = await keptPlayer();
    expect(await player.as.query(api.player.group, { shareToken })).toMatchObject({
      removedFromMyGroups: false,
    });
    await player.as.mutation(api.player.removeFromMyGroups, { groupId });
    expect(await player.as.query(api.player.group, { shareToken })).toMatchObject({
      removedFromMyGroups: true,
    });
    expect(await t.query(api.player.group, { shareToken })).toMatchObject({
      removedFromMyGroups: false,
    });
    const other = await signInAccount(t);
    expect(await other.as.query(api.player.group, { shareToken })).toMatchObject({
      removedFromMyGroups: false,
    });
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    expect(await player.as.query(api.player.group, { shareToken })).toMatchObject({
      removedFromMyGroups: false,
    });
  });

  it("lets only an Account remove", async () => {
    const { groupId } = await keptPlayer();
    const anonymousGm = await signInAnonymousGm(t);

    for (const caller of [t, anonymousGm.as]) {
      await expectErrorCode(
        caller.mutation(api.player.removeFromMyGroups, { groupId }),
        "UNAUTHENTICATED",
      );
    }
  });

  it("returns null for a Group without the Account's claim", async () => {
    const { groupId, shareToken, ada } = await keptPlayer();
    const stranger = await signInAccount(t);

    expect(await stranger.as.mutation(api.player.removeFromMyGroups, { groupId })).toBeNull();
    expect(await answerAs(stranger.as, shareToken, ada)).toEqual({ keptNow: false });
  });

  it("shares the claim rate limit with player.claim", async () => {
    const { groupId, shareToken, ada, player } = await keptPlayer();
    for (let index = 0; index < 4; index++) {
      await player.as.mutation(api.player.removeFromMyGroups, { groupId });
      await player.as.mutation(api.player.claim, { shareToken, playerId: ada });
    }
    await player.as.mutation(api.player.claim, { shareToken, playerId: ada });

    await expectErrorCode(
      player.as.mutation(api.player.removeFromMyGroups, { groupId }),
      "RATE_LIMITED",
    );
  });
});
