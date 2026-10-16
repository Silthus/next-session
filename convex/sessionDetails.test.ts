import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CANCELLED,
  expectErrorCode,
  expiryOf,
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signInAccount,
  signInAnonymousGm,
  spendGmEdits,
  type TestBackend,
} from "./model/test.setup";
import { UNDO_WINDOW_MS } from "../shared/sessions";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 7, 12);
const NIGHT = "2026-10-17";

const USUAL = {
  startTime: "19:00",
  lengthMinutes: 240,
  timeZone: "Europe/Berlin",
  location: "Max's place",
} as const;

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function wait(milliseconds: number) {
  await vi.advanceTimersByTimeAsync(milliseconds);
  await t.finishInProgressScheduledFunctions();
}

const settle = () => wait(UNDO_WINDOW_MS + 1);

async function publishedOf(sessionId: Id<"sessions">) {
  return await t.run(async (ctx) => (await ctx.db.get("sessions", sessionId))?.published);
}

async function groupWithPublishedSession(date = NIGHT) {
  const gm = await signedInGmWithGroup(t);
  await gm.as.mutation(api.groups.updateSettings, { groupId: gm.groupId, ...USUAL });
  const sessionId = await gm.as.mutation(api.sessions.schedule, { groupId: gm.groupId, date });
  await settle();
  return { ...gm, sessionId };
}

async function monthSessionOf(
  as: Awaited<ReturnType<typeof signedInGmWithGroup>>["as"],
  groupId: Id<"groups">,
) {
  const month = await as.query(api.schedule.month, { groupId, month: "2026-10" });
  return month?.sessions[0];
}

describe("sessions.updateDetails", () => {
  it("publishes a burst of edits once, a window after the last one, with the Session's own values", async () => {
    const { as, sessionId } = await groupWithPublishedSession();

    await as.mutation(api.sessions.updateDetails, { sessionId, startTime: "20:00" });
    await wait(10_000);
    await as.mutation(api.sessions.updateDetails, { sessionId, lengthMinutes: 180 });
    await wait(10_000);
    await as.mutation(api.sessions.updateDetails, { sessionId, location: "The club" });
    await wait(UNDO_WINDOW_MS);

    expect(await publishedOf(sessionId)).toMatchObject({ revision: 1 });
    await wait(1);

    expect(await publishedOf(sessionId)).toEqual({
      state: "scheduled",
      start: Date.UTC(2026, 9, 17, 18),
      end: Date.UTC(2026, 9, 17, 21),
      location: "The club",
      summary: "My group",
      revision: 2,
    });
  });

  it("returns a field to the Group's value with null and leaves an absent field alone", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession();
    await as.mutation(api.sessions.updateDetails, {
      sessionId,
      startTime: "20:00",
      location: "The club",
    });
    await settle();

    await as.mutation(api.sessions.updateDetails, { sessionId, startTime: null });
    await settle();

    expect(await publishedOf(sessionId)).toMatchObject({
      start: Date.UTC(2026, 9, 17, 17),
      location: "The club",
      revision: 3,
    });
    expect(await monthSessionOf(as, groupId)).toMatchObject({
      startTime: "19:00",
      location: "The club",
      overrides: ["location"],
    });
  });

  it("reads an empty place of the Session's own as no place this night", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession();

    await as.mutation(api.sessions.updateDetails, { sessionId, location: "   " });
    await settle();

    expect(await publishedOf(sessionId)).not.toHaveProperty("location");
    const session = await monthSessionOf(as, groupId);
    expect(session).not.toHaveProperty("location");
    expect(session).toMatchObject({ overrides: ["location"] });
  });

  it("keeps the Session's own values when it is cancelled and scheduled again", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession();
    await as.mutation(api.sessions.updateDetails, {
      sessionId,
      startTime: "20:00",
      lengthMinutes: 120,
      location: "The club",
    });
    await settle();
    await as.mutation(api.sessions.cancel, { sessionId });
    await settle();

    await as.mutation(api.sessions.schedule, { groupId, date: NIGHT });
    await settle();

    expect(await publishedOf(sessionId)).toMatchObject({
      state: "scheduled",
      start: Date.UTC(2026, 9, 17, 18),
      end: Date.UTC(2026, 9, 17, 20),
      location: "The club",
      revision: 4,
    });
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(t, signInAnonymousGm);
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: NIGHT });
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.sessions.updateDetails, { sessionId, startTime: "20:00" });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });

  it("refuses a Cancelled Session and keeps its values", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const sessionId = await seedSession(t, groupId, NIGHT, { ...CANCELLED, startTime: "20:00" });

    await expectErrorCode(
      as.mutation(api.sessions.updateDetails, { sessionId, startTime: "21:00" }),
      "SESSION_CANCELLED",
    );
    expect(await monthSessionOf(as, groupId)).toMatchObject({ startTime: "20:00" });
  });

  it("refuses a Session that has passed", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const sessionId = await seedSession(t, groupId, "2026-10-06");

    await expectErrorCode(
      as.mutation(api.sessions.updateDetails, { sessionId, startTime: "21:00" }),
      "OUT_OF_WINDOW",
    );
    expect(await monthSessionOf(as, groupId)).toMatchObject({ startTime: "19:00", overrides: [] });
  });

  it.each([
    { startTime: "7pm" },
    { startTime: "24:00" },
    { lengthMinutes: 15 },
    { lengthMinutes: 735 },
    { lengthMinutes: 250 },
    { location: "x".repeat(201) },
  ])("refuses %o as invalid and changes nothing", async (invalid) => {
    const { as, groupId, sessionId } = await groupWithPublishedSession();

    await expectErrorCode(
      as.mutation(api.sessions.updateDetails, { sessionId, startTime: "20:00", ...invalid }),
      "INVALID_SETTINGS",
    );
    expect(await monthSessionOf(as, groupId)).toMatchObject({ overrides: [] });
  });

  it("refuses once the GM's edits are spent, and changes nothing", async () => {
    const { as, groupId, userId, sessionId } = await groupWithPublishedSession();
    await spendGmEdits(t, userId);

    await expectErrorCode(
      as.mutation(api.sessions.updateDetails, { sessionId, startTime: "20:00" }),
      "RATE_LIMITED",
    );
    expect(await monthSessionOf(as, groupId)).toMatchObject({ overrides: [] });
  });
});

describe("a Session's own values against a saved Time and place", () => {
  it("keeps the Session's own start time and still follows the Group's length", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession();
    await as.mutation(api.sessions.updateDetails, { sessionId, startTime: "20:00" });
    await settle();

    await as.mutation(api.groups.updateSettings, {
      groupId,
      ...USUAL,
      startTime: "18:30",
      lengthMinutes: 180,
    });
    await settle();

    expect(await publishedOf(sessionId)).toMatchObject({
      start: Date.UTC(2026, 9, 17, 18),
      end: Date.UTC(2026, 9, 17, 21),
      revision: 3,
    });
  });

  it("moves a Session that has only its own time to the new place, and leaves one with its own place alone", async () => {
    const { as, groupId, sessionId: ownTime } = await groupWithPublishedSession();
    const ownPlace = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" });
    await settle();
    await as.mutation(api.sessions.updateDetails, { sessionId: ownTime, startTime: "20:00" });
    await as.mutation(api.sessions.updateDetails, { sessionId: ownPlace, location: "The club" });
    await settle();

    await as.mutation(api.groups.updateSettings, { groupId, ...USUAL, location: "Ana's flat" });
    await settle();

    expect(await publishedOf(ownTime)).toMatchObject({
      start: Date.UTC(2026, 9, 17, 18),
      location: "Ana's flat",
      revision: 3,
    });
    expect(await publishedOf(ownPlace)).toMatchObject({ location: "The club", revision: 2 });
  });
});

describe("the reads", () => {
  async function groupWithOwnNight() {
    const gm = await groupWithPublishedSession();
    await gm.as.mutation(api.sessions.updateDetails, {
      sessionId: gm.sessionId,
      startTime: "20:00",
      location: "The club",
    });
    return gm;
  }

  async function shareTokenOf(groupId: Id<"groups">) {
    return await t.run(async (ctx) => (await ctx.db.get("groups", groupId))!.shareToken);
  }

  it("schedule.month returns the Session's own values and which ones it overrides", async () => {
    const { as, groupId } = await groupWithOwnNight();

    expect(await monthSessionOf(as, groupId)).toMatchObject({
      date: NIGHT,
      startTime: "20:00",
      lengthMinutes: 240,
      location: "The club",
      overrides: ["startTime", "location"],
    });
  });

  it("player.group shows the Session's own values over the Group's", async () => {
    const { groupId } = await groupWithOwnNight();

    const group = await t.query(api.player.group, { shareToken: await shareTokenOf(groupId) });

    expect(group?.sessions).toEqual([
      {
        date: NIGHT,
        state: "scheduled",
        startTime: "20:00",
        lengthMinutes: 240,
        location: "The club",
      },
    ]);
  });

  it("me.groups shows the Session's own values to the GM and to a Claimed Player", async () => {
    const { as, groupId } = await groupWithOwnNight();
    const shareToken = await shareTokenOf(groupId);
    const player = await signInAccount(t);
    await player.as.mutation(api.player.join, { shareToken, name: "Ana" });
    const ownNight = {
      date: NIGHT,
      state: "scheduled",
      startTime: "20:00",
      lengthMinutes: 240,
      location: "The club",
    };

    const running = await as.query(api.me.groups, { today: "2026-10-07" });
    const playing = await player.as.query(api.me.groups, { today: "2026-10-07" });

    expect(running?.running[0]?.upcomingSessions).toEqual([ownNight]);
    expect(playing?.playing[0]?.upcomingSessions).toEqual([ownNight]);
  });
});
