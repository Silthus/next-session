import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CANCELLED,
  expectErrorCode,
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
const BERLIN = "Europe/Berlin";

const USUAL = { startTime: "19:00", lengthMinutes: 240 };

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

const scheduled = (...dates: string[]) =>
  dates.map((date) => ({ date, state: "scheduled", ...USUAL }));
const cancelled = (date: string) => ({ date, state: "cancelled", ...USUAL });

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
          timeZone: BERLIN,
          upcomingSessions: scheduled(
            TODAY,
            "2026-10-09",
            "2026-10-16",
            "2026-10-23",
            "2026-10-30",
          ),
        },
      ],
      playing: [],
    });
  });

  it("counts a Cancelled Session toward the next five, marked cancelled", async () => {
    const { as, groupId } = await groupWithGm();
    for (const date of [TODAY, "2026-10-09", "2026-10-16"]) await seedSession(t, groupId, date);
    for (const date of ["2026-10-10", "2026-10-11"]) await seedSession(t, groupId, date, CANCELLED);
    await seedSession(t, groupId, "2026-10-23");

    expect((await myGroups(as))?.running[0]?.upcomingSessions).toEqual([
      ...scheduled(TODAY, "2026-10-09"),
      cancelled("2026-10-10"),
      cancelled("2026-10-11"),
      ...scheduled("2026-10-16"),
    ]);
  });

  it("shows when and where each upcoming Session is, in the Group's time zone", async () => {
    const { as, groupId, shareToken } = await groupWithGm();
    const saved = { startTime: "18:30", lengthMinutes: 180, location: "Max's place" };
    await as.mutation(api.groups.updateSettings, {
      groupId,
      ...saved,
      timeZone: "America/New_York",
    });
    await seedSession(t, groupId, "2026-10-17");
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);
    const expected = {
      timeZone: "America/New_York",
      upcomingSessions: [{ date: "2026-10-17", state: "scheduled", ...saved }],
    };

    expect((await myGroups(as))?.running).toMatchObject([expected]);
    expect((await myGroups(player.as))?.playing).toMatchObject([expected]);
  });

  it("keeps a Cancelled Session on its date and drops it once the date has passed", async () => {
    const { groupId, shareToken } = await groupWithGm();
    await seedSession(t, groupId, TODAY, CANCELLED);
    const player = await signInAccount(t);
    await joinAs(player.as, shareToken);
    expect((await myGroups(player.as))?.playing[0]?.upcomingSessions).toEqual([cancelled(TODAY)]);

    vi.setSystemTime(NOW + 60 * 60_000);

    expect((await myGroups(player.as, TOMORROW))?.playing[0]?.upcomingSessions).toEqual([]);
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
          timeZone: BERLIN,
          upcomingSessions: scheduled("2026-10-17"),
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
      { upcomingSessions: scheduled(TODAY, "2026-10-17"), openDates: BOOKABLE_DAYS_FROM_TODAY },
    ]);

    vi.setSystemTime(NOW + 60 * 60_000);

    expect((await myGroups(player.as, TOMORROW))?.playing).toMatchObject([
      { upcomingSessions: scheduled("2026-10-17"), openDates: BOOKABLE_DAYS_FROM_TODAY - 1 },
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
    expect(await upcomingAsOf("2026-10-02")).toEqual(scheduled(TODAY));
    for (const wrongClock of ["2026-10-05", "2026-09-01", "2026-13-01", "today"]) {
      expect(await upcomingAsOf(wrongClock)).toEqual(scheduled(TODAY));
    }
  });
});

describe("the Calendar feed link", () => {
  const SITE_URL = "https://next-session.test";
  const FEED_URL = new RegExp(`^${SITE_URL}/cal/a/[A-Za-z0-9_-]{22}\\.ics$`);
  const CALENDAR_FEED_CALLS_PER_HOUR = 10;

  beforeEach(() => {
    vi.stubEnv("SITE_URL", SITE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const calendarFeed = (as: GmClient) => as.mutation(api.me.calendarFeed, {});
  const resetCalendarFeed = (as: GmClient) => as.mutation(api.me.resetCalendarFeed, {});

  it("is minted on the first call and the same on every call after", async () => {
    const { as } = await signInAccount(t);

    const first = await calendarFeed(as);

    expect(first.url).toMatch(FEED_URL);
    expect(await calendarFeed(as)).toEqual(first);
  });

  it("is a different link for each Account", async () => {
    const ours = await calendarFeed((await signInAccount(t)).as);
    const theirs = await calendarFeed((await signInAccount(t)).as);

    expect(ours).not.toEqual(theirs);
  });

  it("is replaced by a reset, which later calls keep returning", async () => {
    const { as } = await signInAccount(t);
    const before = await calendarFeed(as);

    const reset = await resetCalendarFeed(as);

    expect(reset.url).toMatch(FEED_URL);
    expect(reset).not.toEqual(before);
    expect(await calendarFeed(as)).toEqual(reset);
  });

  it("is minted by a reset when the Account had none", async () => {
    const { as } = await signInAccount(t);

    const reset = await resetCalendarFeed(as);

    expect(reset.url).toMatch(FEED_URL);
    expect(await calendarFeed(as)).toEqual(reset);
  });

  it("is refused to a visitor and an Anonymous GM", async () => {
    const anonymousGm = await signInAnonymousGm(t);

    for (const as of [t, anonymousGm.as]) {
      await expectErrorCode(as.mutation(api.me.calendarFeed, {}), "UNAUTHENTICATED");
      await expectErrorCode(as.mutation(api.me.resetCalendarFeed, {}), "UNAUTHENTICATED");
    }
  });

  it("is shown again however often the Account asks for the link it already has", async () => {
    const { as } = await signInAccount(t);
    const first = await calendarFeed(as);

    for (let call = 0; call < CALENDAR_FEED_CALLS_PER_HOUR * 2; call++) {
      expect(await calendarFeed(as)).toEqual(first);
    }
  });

  it("is not replaced once the Account spent its new links for the hour, and only for that Account", async () => {
    const spent = await signInAccount(t);
    const other = await signInAccount(t);
    let current = await calendarFeed(spent.as);
    for (let call = 1; call < CALENDAR_FEED_CALLS_PER_HOUR; call++) {
      current = await resetCalendarFeed(spent.as);
    }

    await expectErrorCode(resetCalendarFeed(spent.as), "RATE_LIMITED");
    expect(await calendarFeed(spent.as)).toEqual(current);
    expect((await resetCalendarFeed(other.as)).url).toMatch(FEED_URL);
  });

  it("is replaced again an hour later", async () => {
    const { as } = await signInAccount(t);
    for (let call = 0; call < CALENDAR_FEED_CALLS_PER_HOUR; call++) await resetCalendarFeed(as);
    await expectErrorCode(resetCalendarFeed(as), "RATE_LIMITED");

    vi.setSystemTime(NOW + 60 * 60_000);

    expect((await resetCalendarFeed(as)).url).toMatch(FEED_URL);
  });
});
