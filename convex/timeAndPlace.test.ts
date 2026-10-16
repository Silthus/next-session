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

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 7, 12);
const UNDO_WINDOW_MS = 30_000;

const USUAL = {
  startTime: "19:00",
  lengthMinutes: 240,
  timeZone: "Europe/Berlin",
  location: "",
} as const;

const TUESDAYS_AT_MAX = {
  startTime: "18:30",
  lengthMinutes: 180,
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

async function publishedOf(sessionId: Id<"sessions">) {
  return await t.run(async (ctx) => (await ctx.db.get("sessions", sessionId))?.published);
}

async function groupWithPublishedSession(date = "2026-10-17") {
  const gm = await signedInGmWithGroup(t);
  const sessionId = await gm.as.mutation(api.sessions.schedule, { groupId: gm.groupId, date });
  await wait(UNDO_WINDOW_MS + 1);
  return { ...gm, sessionId };
}

describe("groups.settings", () => {
  it("reads a Group nobody has set up as 19:00 for 4 hours, Berlin time, with no location", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    expect(await as.query(api.groups.settings, { groupId })).toEqual({
      startTime: "19:00",
      lengthMinutes: 240,
      timeZone: "Europe/Berlin",
      saved: false,
    });
  });

  it("reads back what the GM saved", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });

    expect(await as.query(api.groups.settings, { groupId })).toEqual({
      ...TUESDAYS_AT_MAX,
      saved: true,
    });
  });

  it("reads a missing id as null", async () => {
    const { as } = await signedInGmWithGroup(t);

    expect(await as.query(api.groups.settings, { groupId: "not-a-group" })).toBeNull();
  });
});

describe("groups.create", () => {
  it("keeps the browser's time zone for the new Group", async () => {
    const { as } = await signInAccount(t);

    const groupId = await as.mutation(api.groups.create, { timeZone: "America/New_York" });

    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({
      timeZone: "America/New_York",
      saved: false,
    });
  });

  it("keeps the time zone in its usual spelling", async () => {
    const { as } = await signInAccount(t);

    const groupId = await as.mutation(api.groups.create, { timeZone: "america/new_york" });

    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({
      timeZone: "America/New_York",
    });
  });

  it("drops a time zone it doesn't know and follows Berlin time", async () => {
    const { as } = await signInAccount(t);

    const groupId = await as.mutation(api.groups.create, { timeZone: "Mars/Olympus_Mons" });

    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({
      timeZone: "Europe/Berlin",
    });
  });
});

describe("groups.updateSettings", () => {
  it("trims the location", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    await as.mutation(api.groups.updateSettings, {
      groupId,
      ...TUESDAYS_AT_MAX,
      location: "  Max's place \n",
    });

    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({
      location: "Max's place",
    });
  });

  it("clears the location when it is left empty", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });

    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX, location: "   " });

    expect(await as.query(api.groups.settings, { groupId })).toEqual({
      startTime: "18:30",
      lengthMinutes: 180,
      timeZone: "Europe/Berlin",
      saved: true,
    });
  });

  it("keeps the time zone in its usual spelling", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    await as.mutation(api.groups.updateSettings, {
      groupId,
      ...TUESDAYS_AT_MAX,
      timeZone: "europe/lisbon",
    });

    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({
      timeZone: "Europe/Lisbon",
    });
  });

  it("takes a location of 200 characters", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const location = "x".repeat(200);

    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX, location });

    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({ location });
  });

  it.each([
    { startTime: "7pm" },
    { startTime: "7:30" },
    { startTime: "24:00" },
    { lengthMinutes: 15 },
    { lengthMinutes: 735 },
    { lengthMinutes: 250 },
    { timeZone: "Mars/Olympus_Mons" },
    { location: "x".repeat(201) },
  ])("refuses %o as invalid settings and changes nothing", async (invalid) => {
    const { as, groupId } = await signedInGmWithGroup(t);

    await expectErrorCode(
      as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX, ...invalid }),
      "INVALID_SETTINGS",
    );
    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({ saved: false });
  });

  it("refuses once the GM's edits are spent, and changes nothing", async () => {
    const { as, groupId, userId } = await signedInGmWithGroup(t);
    await spendGmEdits(t, userId);

    await expectErrorCode(
      as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX }),
      "RATE_LIMITED",
    );
    expect(await as.query(api.groups.settings, { groupId })).toMatchObject({ saved: false });
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(t, signInAnonymousGm);
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });

    expect(await expiryOf(t, groupId)).toBe(NOW + 32 * DAY);
  });
});

describe("a saved Time and place", () => {
  it("publishes each upcoming Session once, a window after the last save, at the new time and place", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession("2026-10-17");
    const laterId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-11-03" });
    await wait(UNDO_WINDOW_MS + 1);

    await as.mutation(api.groups.updateSettings, { groupId, ...USUAL, startTime: "20:00" });
    await wait(10_000);
    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });
    await wait(UNDO_WINDOW_MS);

    expect(await publishedOf(sessionId)).toMatchObject({ revision: 1 });
    await wait(1);

    expect(await publishedOf(sessionId)).toEqual({
      state: "scheduled",
      start: Date.UTC(2026, 9, 17, 16, 30),
      end: Date.UTC(2026, 9, 17, 19, 30),
      location: "Max's place",
      summary: "My group",
      revision: 2,
    });
    expect(await publishedOf(laterId)).toEqual({
      state: "scheduled",
      start: Date.UTC(2026, 10, 3, 17, 30),
      end: Date.UTC(2026, 10, 3, 20, 30),
      location: "Max's place",
      summary: "My group",
      revision: 2,
    });
  });

  it("follows a new time zone", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession("2026-10-17");

    await as.mutation(api.groups.updateSettings, {
      groupId,
      ...USUAL,
      timeZone: "America/New_York",
    });
    await wait(UNDO_WINDOW_MS + 1);

    expect(await publishedOf(sessionId)).toMatchObject({
      start: Date.UTC(2026, 9, 17, 23),
      end: Date.UTC(2026, 9, 18, 3),
      revision: 2,
    });
  });

  it("publishes nothing when the save changes nothing", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession();
    const before = await publishedOf(sessionId);

    await as.mutation(api.groups.updateSettings, { groupId, ...USUAL });
    await wait(UNDO_WINDOW_MS + 1);

    expect(await publishedOf(sessionId)).toEqual(before);
  });

  it("leaves a Cancelled Session's published time alone", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const sessionId = await seedSession(t, groupId, "2026-10-17", CANCELLED);

    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });
    await wait(UNDO_WINDOW_MS + 1);

    expect(await publishedOf(sessionId)).toEqual(CANCELLED.published);
  });

  it("leaves a past Session's published time alone", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const published = { state: "scheduled", revision: 1 } as const;
    const sessionId = await seedSession(t, groupId, "2026-10-06", { published });

    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });
    await wait(UNDO_WINDOW_MS + 1);

    expect(await publishedOf(sessionId)).toEqual(published);
  });

  it("publishes a Cancelled Session at the new time once it is scheduled again", async () => {
    const { as, groupId, sessionId } = await groupWithPublishedSession("2026-10-17");
    await as.mutation(api.sessions.cancel, { sessionId });
    await wait(UNDO_WINDOW_MS + 1);
    await as.mutation(api.groups.updateSettings, { groupId, ...TUESDAYS_AT_MAX });
    await wait(UNDO_WINDOW_MS + 1);

    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    await wait(UNDO_WINDOW_MS + 1);

    expect(await publishedOf(sessionId)).toMatchObject({
      state: "scheduled",
      start: Date.UTC(2026, 9, 17, 16, 30),
      location: "Max's place",
      revision: 3,
    });
  });
});
