import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectErrorCode,
  type GmClient,
  newBackend,
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

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function sharedGroup(signInGm = signInAccount) {
  const gm = await signInGm(t);
  const groupId = await gm.as.mutation(api.groups.create, {});
  return { ...gm, groupId, shareToken: await shareTokenOf(groupId) };
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

async function seedSession(groupId: Id<"groups">, scheduledBy: Id<"users">, date: string) {
  await t.run(async (ctx) => await ctx.db.insert("sessions", { groupId, date, scheduledBy }));
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

async function expiryOf(groupId: Id<"groups">) {
  return await t.run(async (ctx) => (await ctx.db.get("groups", groupId))?.expiresAt);
}

async function rotatedAway(groupId: Id<"groups">, as: GmClient) {
  const oldShareToken = await shareTokenOf(groupId);
  await as.mutation(api.groups.rotateShareToken, { groupId });
  return oldShareToken;
}

async function spendGroupAnswerTokens(groupId: Id<"groups">, shareToken: string, count: number) {
  const tapsPerPlayer = 60;
  for (let first = 0; first < count; first += tapsPerPlayer) {
    const playerId = await seedPlayer(groupId, `Tapper ${first}`);
    for (let tap = first; tap < Math.min(first + tapsPerPlayer, count); tap++) {
      await t.mutation(api.player.answer, { shareToken, playerId, date: TODAY, answer: "free" });
    }
  }
}

function datesFrom(first: number, last: number, month = "2026-10") {
  return Array.from(
    { length: last - first + 1 },
    (_, index) => `${month}-${String(first + index).padStart(2, "0")}`,
  );
}

describe("player.group", () => {
  it("shows the Group's name, its Roster, and every Session date", async () => {
    const { groupId, shareToken, userId } = await sharedGroup();
    const bo = await seedPlayer(groupId, "Bo");
    const ada = await seedPlayer(groupId, "Ada");
    for (const date of ["2026-10-02", TODAY, "2026-10-17", LAST_BOOKABLE_DATE, "2027-01-01"]) {
      await seedSession(groupId, userId, date);
    }

    expect(await t.query(api.player.group, { shareToken })).toEqual({
      groupId,
      name: "My group",
      players: [
        { _id: ada, name: "Ada" },
        { _id: bo, name: "Bo" },
      ],
      sessionDates: ["2026-10-02", TODAY, "2026-10-17", LAST_BOOKABLE_DATE, "2027-01-01"],
    });
  });

  it("shows only the Group behind the Share Token", async () => {
    const mine = await sharedGroup();
    const other = await sharedGroup();
    await seedPlayer(other.groupId, "Stranger");
    await seedSession(other.groupId, other.userId, "2026-10-17");

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

    expect(await expiryOf(groupId)).toBe(NOW + 32 * DAY);
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
    await expect(tap(bo)).resolves.toBeNull();

    vi.advanceTimersByTime(MINUTE / 120);
    await expect(tap(ada)).resolves.toBeNull();
  });

  it("rate limits a Group to a burst of 300 Answers across its Players", async () => {
    const busy = await sharedGroup();
    const quiet = await sharedGroup();
    await spendGroupAnswerTokens(busy.groupId, busy.shareToken, 300);
    const latecomer = await seedPlayer(busy.groupId, "Ada");
    const outsider = await seedPlayer(quiet.groupId, "Ada");
    const tap = (shareToken: string, playerId: Id<"players">) =>
      t.mutation(api.player.answer, { shareToken, playerId, date: TODAY, answer: "free" });

    await expectErrorCode(tap(busy.shareToken, latecomer), "RATE_LIMITED");
    await expect(tap(quiet.shareToken, outsider)).resolves.toBeNull();
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

    expect(await expiryOf(groupId)).toBe(NOW + 32 * DAY);
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

  it("spends one token of the Group's Answer rate limit", async () => {
    const { groupId, shareToken } = await sharedGroup();
    await spendGroupAnswerTokens(groupId, shareToken, 299);
    const ada = await seedPlayer(groupId, "Ada");
    const bo = await seedPlayer(groupId, "Bo");
    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    await expectErrorCode(
      t.mutation(api.player.fillRest, { shareToken, playerId: bo, month: "2026-11" }),
      "RATE_LIMITED",
    );
    expect(await answersOf(bo)).toEqual({});
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { groupId, shareToken } = await sharedGroup(signInAnonymousGm);
    const ada = await seedPlayer(groupId, "Ada");
    vi.setSystemTime(NOW + 2 * DAY);

    await t.mutation(api.player.fillRest, { shareToken, playerId: ada, month: "2026-11" });

    expect(await expiryOf(groupId)).toBe(NOW + 32 * DAY);
  });
});
