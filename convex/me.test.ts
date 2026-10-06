import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type GmClient,
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signInAccount,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";

const NOW = Date.UTC(2026, 9, 3, 23, 30);
const TODAY = "2026-10-03";
const TOMORROW = "2026-10-04";
const BOOKABLE_DAYS_FROM_TODAY = 29 + 30 + 31;

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function shareTokenOf(groupId: Id<"groups">) {
  const group = await t.run(async (ctx) => await ctx.db.get("groups", groupId));
  if (group === null) throw new Error("Group is gone");
  return group.shareToken;
}

async function groupWithGm() {
  const gm = await signedInGmWithGroup(t);
  await gm.as.mutation(api.groups.rename, { groupId: gm.groupId, name: "Dragon table" });
  return { ...gm, shareToken: await shareTokenOf(gm.groupId) };
}

async function joinAs(as: GmClient, shareToken: string, name = "Ada") {
  return await as.mutation(api.player.join, { shareToken, name });
}

async function seedAnswers(groupId: Id<"groups">, playerId: Id<"players">, dates: string[]) {
  await t.run(async (ctx) => {
    for (const date of dates) {
      await ctx.db.insert("answers", { groupId, playerId, date, answer: "free" });
    }
  });
}

const myGroups = (as: GmClient | TestBackend, today = TODAY) => as.query(api.me.groups, { today });

describe("me.groups", () => {
  it("is null for a visitor and an Anonymous GM", async () => {
    const anonymousGm = await signInAnonymousGm(t);

    expect(await myGroups(t)).toBeNull();
    expect(await myGroups(anonymousGm.as)).toBeNull();
  });

  it("is empty for an Account that runs and plays nowhere", async () => {
    const account = await signInAccount(t);

    expect(await myGroups(account.as)).toEqual({ running: [], playing: [] });
  });

  it("lists the Groups the Account runs with their next five Sessions from today", async () => {
    const { as, groupId } = await groupWithGm();
    for (const date of ["2026-10-02", TODAY, "2026-10-09", "2026-10-16", "2026-10-23"]) {
      await seedSession(t, groupId, date);
    }
    for (const date of ["2026-10-30", "2026-11-06", "2026-11-13"]) {
      await seedSession(t, groupId, date);
    }

    expect(await myGroups(as)).toEqual({
      running: [
        {
          groupId,
          name: "Dragon table",
          upcomingSessions: [TODAY, "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"],
        },
      ],
      playing: [],
    });
  });

  it("lists the Groups the Account plays in with its Player and the days left to answer", async () => {
    const { groupId, shareToken } = await groupWithGm();
    await seedSession(t, groupId, "2026-10-17");
    const player = await signInAccount(t);
    const ada = await joinAs(player.as, shareToken);
    await seedAnswers(groupId, ada, [
      "2026-10-01",
      TODAY,
      "2026-11-11",
      "2026-12-31",
      "2027-01-01",
    ]);

    expect(await myGroups(player.as)).toEqual({
      running: [],
      playing: [
        {
          groupId,
          name: "Dragon table",
          shareToken,
          playerId: ada,
          playerName: "Ada",
          upcomingSessions: ["2026-10-17"],
          openDates: BOOKABLE_DAYS_FROM_TODAY - 3,
        },
      ],
    });
  });

  it("shows a Group the Account runs and plays in in both lists", async () => {
    const { as, groupId, shareToken } = await groupWithGm();
    await joinAs(as, shareToken);

    const groups = await myGroups(as);

    expect(groups?.running.map((group) => group.groupId)).toEqual([groupId]);
    expect(groups?.playing.map((group) => group.groupId)).toEqual([groupId]);
  });

  it("drops a Group once the Account releases its claim there", async () => {
    const { groupId, shareToken } = await groupWithGm();
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);

    await player.as.mutation(api.player.release, { groupId });

    expect(await myGroups(player.as)).toEqual({ running: [], playing: [] });
  });

  it("drops a Group once the GM removes the Claimed Player", async () => {
    const { as, shareToken } = await groupWithGm();
    const player = await signInAccount(t);
    const ada = await joinAs(player.as, shareToken);

    await as.mutation(api.roster.removePlayer, { playerId: ada });

    expect(await myGroups(player.as)).toEqual({ running: [], playing: [] });
  });

  it("skips a claim whose Group is deleted while its Players are still being removed", async () => {
    const { as, groupId, shareToken } = await groupWithGm();
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);

    await as.mutation(api.groups.remove, { groupId });

    expect(await myGroups(player.as)).toEqual({ running: [], playing: [] });
  });

  it("returns the current Share Token after the GM rotates it", async () => {
    const { as, groupId, shareToken } = await groupWithGm();
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);

    await as.mutation(api.groups.rotateShareToken, { groupId });

    const rotated = await shareTokenOf(groupId);
    expect(rotated).not.toBe(shareToken);
    expect((await myGroups(player.as))?.playing).toMatchObject([{ shareToken: rotated }]);
  });

  it("moves on at midnight without a write", async () => {
    const { groupId, shareToken } = await groupWithGm();
    await seedSession(t, groupId, TODAY);
    await seedSession(t, groupId, "2026-10-17");
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);
    expect((await myGroups(player.as))?.playing).toMatchObject([
      { upcomingSessions: [TODAY, "2026-10-17"], openDates: BOOKABLE_DAYS_FROM_TODAY },
    ]);

    vi.setSystemTime(NOW + 60 * 60_000);

    expect((await myGroups(player.as, TOMORROW))?.playing).toMatchObject([
      { upcomingSessions: ["2026-10-17"], openDates: BOOKABLE_DAYS_FROM_TODAY - 1 },
    ]);
  });

  it("accepts a client date one day off the server's but no further", async () => {
    const { groupId, shareToken } = await groupWithGm();
    await seedSession(t, groupId, TODAY);
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);
    const upcomingAsOf = async (today: string) =>
      (await myGroups(player.as, today))?.playing[0]?.upcomingSessions;

    expect(await upcomingAsOf(TOMORROW)).toEqual([]);
    expect(await upcomingAsOf("2026-10-02")).toEqual([TODAY]);
    for (const wrongClock of ["2026-10-05", "2026-09-01", "2026-13-01", "today"]) {
      expect(await upcomingAsOf(wrongClock)).toEqual([TODAY]);
    }
  });
});
