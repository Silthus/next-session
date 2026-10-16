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

const notificationSettings = (as: GmClient | TestBackend) =>
  as.query(api.me.notificationSettings, {});

function configureReminders() {
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "mail-webhook-secret");
  vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", "https://webhooks.example.test/reminders");
}

describe("me.notificationSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null for a visitor and an Anonymous GM", async () => {
    const anonymousGm = await signInAnonymousGm(t);

    expect(await notificationSettings(t)).toBeNull();
    expect(await notificationSettings(anonymousGm.as)).toBeNull();
  });

  it("hides Reminders while they are not configured", async () => {
    const account = await signInAccount(t);

    expect(await notificationSettings(account.as)).toEqual({
      sessionEmails: true,
      reminders: null,
    });
  });

  it.each(["POSTHOG_REMINDER_WEBHOOK_URL", "POSTHOG_MAIL_WEBHOOK_SECRET"])(
    "hides Reminders without %s",
    async (variable) => {
      configureReminders();
      vi.stubEnv(variable, "");
      const account = await signInAccount(t);

      expect((await notificationSettings(account.as))?.reminders).toBeNull();
    },
  );

  it("reads Reminders as on by default once they are configured", async () => {
    configureReminders();
    const account = await signInAccount(t);

    expect(await notificationSettings(account.as)).toEqual({
      sessionEmails: true,
      reminders: true,
    });
  });
});

describe("me.setReminders", () => {
  beforeEach(configureReminders);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("turns only the caller's Reminders off and back on, leaving Session updates alone", async () => {
    const account = await signInAccount(t);
    const other = await signInAccount(t);

    await account.as.mutation(api.me.setReminders, { enabled: false });

    expect(await notificationSettings(account.as)).toEqual({
      sessionEmails: true,
      reminders: false,
    });
    expect((await notificationSettings(other.as))?.reminders).toBe(true);

    await account.as.mutation(api.me.setReminders, { enabled: true });

    expect((await notificationSettings(account.as))?.reminders).toBe(true);
  });

  it("leaves Reminders alone when Session updates are turned off", async () => {
    const account = await signInAccount(t);

    await account.as.mutation(api.me.setSessionEmails, { enabled: false });

    expect(await notificationSettings(account.as)).toEqual({
      sessionEmails: false,
      reminders: true,
    });
  });

  it("refuses a visitor and an Anonymous GM", async () => {
    const anonymousGm = await signInAnonymousGm(t);

    await expectErrorCode(t.mutation(api.me.setReminders, { enabled: false }), "UNAUTHENTICATED");
    await expectErrorCode(
      anonymousGm.as.mutation(api.me.setReminders, { enabled: false }),
      "UNAUTHENTICATED",
    );
  });
});
