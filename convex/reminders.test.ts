import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signIn,
  type GmClient,
  type TestBackend,
} from "./model/test.setup";
import { UNDO_WINDOW_MS } from "./sessionLifecycle";

const HOUR = 3_600_000;
const REMINDER_WEBHOOK = "https://example.test/reminder";
const date = "2026-10-17";
const start = Date.UTC(2026, 9, 17, 17);
const dayDue = start - 24 * HOUR;
const hoursDue = start - 2 * HOUR;

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", REMINDER_WEBHOOK);
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "secret");
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function crew() {
  const gm = await signedInGmWithGroup(t);
  const robin = await signIn(t, { email: "robin@example.com" });
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", gm.groupId, { name: "Thursday Crew", shareToken: "share-token" });
    await ctx.db.insert("players", {
      groupId: gm.groupId,
      name: "Robin",
      nameKey: "robin",
      userId: robin.userId,
    });
  });
  return { ...gm, robin };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1);
  await deliver();
}

async function deliver() {
  for (let hop = 0; hop < 8; hop++) {
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(1);
  }
  await t.finishInProgressScheduledFunctions();
}

async function at(instant: number) {
  await vi.advanceTimersByTimeAsync(instant - Date.now());
  await deliver();
}

function reminders() {
  return fetchMock.mock.calls
    .filter(([url]) => url === REMINDER_WEBHOOK)
    .map(([, init]) => JSON.parse(init!.body as string) as Record<string, unknown>);
}

function leads() {
  return reminders().map(({ lead }) => lead);
}

async function saveTimeAndPlace(
  as: GmClient,
  groupId: Id<"groups">,
  changes: { startTime?: string; timeZone?: string; location?: string },
) {
  await as.mutation(api.groups.updateSettings, {
    groupId,
    startTime: "19:00",
    lengthMinutes: 240,
    timeZone: "Europe/Berlin",
    location: "",
    ...changes,
  });
}

async function claimPlayers(groupId: Id<"groups">, userIds: Id<"users">[]) {
  await t.run(async (ctx) => {
    for (const [index, userId] of userIds.entries()) {
      await ctx.db.insert("players", {
        groupId,
        name: `Player ${index}`,
        nameKey: `player ${index}`,
        userId,
      });
    }
  });
}

async function robinsPlayer(groupId: Id<"groups">) {
  return await t.run(async (ctx) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId).eq("nameKey", "robin"))
      .collect();
    return players[0]!._id;
  });
}

async function reminderLinkTokenOf(userId: Id<"users">) {
  return await t.run(async (ctx) => (await ctx.db.get("users", userId))?.reminderLinkToken);
}

async function sessionRow(sessionId: Id<"sessions">) {
  return await t.run(async (ctx) => await ctx.db.get("sessions", sessionId));
}

async function scheduledReminders() {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      ({ name, state }) => name.startsWith("reminders") && state.kind === "pending",
    ),
  );
}

async function mailVolumeOn(day: string) {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("mailVolume")
          .withIndex("by_day", (q) => q.eq("day", day))
          .unique()
      )?.count,
  );
}

function isoDate(instant: number) {
  return new Date(instant).toISOString().slice(0, 10);
}

async function publishedBeforeSwitchOn(
  groupId: Id<"groups">,
  sessionDate: string,
  startsAt: number,
) {
  return await seedSession(t, groupId, sessionDate, {
    published: { state: "scheduled", start: startsAt, end: startsAt + 4 * HOUR, revision: 1 },
  });
}

it("reminds each Claimed Account once, 1 day and again 2 hours before the start", async () => {
  const { as, groupId } = await crew();
  await as.mutation(api.sessions.schedule, { groupId, date });
  await settle();

  await at(dayDue - 1_000);
  expect(leads()).toEqual([]);
  await at(dayDue);
  expect(leads()).toEqual(["day"]);
  await at(hoursDue - 1_000);
  expect(leads()).toEqual(["day"]);
  await at(hoursDue);
  expect(leads()).toEqual(["day", "hours"]);
  await at(start + HOUR);
  expect(leads()).toEqual(["day", "hours"]);
});

it("names the Group, the date, the start and the location in the Group's time zone, and links only the current Share Link", async () => {
  const { as, groupId, robin } = await crew();
  await saveTimeAndPlace(as, groupId, { location: "Max's place" });
  await as.mutation(api.sessions.schedule, { groupId, date });
  await settle();
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", groupId, { name: "Renamed Crew", shareToken: "new-token" });
  });

  await at(dayDue);

  const token = await reminderLinkTokenOf(robin.userId);
  expect(reminders()).toEqual([
    {
      distinct_id: `next-session:${robin.userId}`,
      product: "next-session",
      email: "robin@example.com",
      group_name: "Renamed Crew",
      date_label: "Saturday, October 17, 2026",
      start_label: "19:00",
      location: "Max's place",
      lead: "day",
      player_url: "https://next-session.link/s/new-token",
      reminders_off_url: `https://next-session.link/reminders/off?t=${token}`,
    },
  ]);
  expect(token).toMatch(/^[\w-]{20,}$/);
  const fieldsWithShareToken = Object.entries(reminders()[0]!)
    .filter(([, value]) => /new-token|share-token/.test(String(value)))
    .map(([field]) => field);
  expect(fieldsWithShareToken).toEqual(["player_url"]);
  expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).get("Authorization")).toBe(
    "Bearer secret",
  );
});

it("writes the date and start in a Group time zone far from UTC and leaves out a missing location", async () => {
  const { as, groupId } = await crew();
  await saveTimeAndPlace(as, groupId, { startTime: "21:30", timeZone: "America/Los_Angeles" });
  await as.mutation(api.sessions.schedule, { groupId, date });
  await settle();

  await at(Date.UTC(2026, 9, 18, 4, 30));

  const label = { date_label: "Saturday, October 17, 2026", start_label: "21:30" };
  expect(reminders()).toEqual([
    expect.objectContaining({ ...label, lead: "day" }),
    expect.objectContaining({ ...label, lead: "hours" }),
  ]);
  expect(reminders().filter((body) => "location" in body)).toEqual([]);
});

it("reminds each Account once however many Players it claims, the GM only through a Player of their own, and never an Account that can't get mail", async () => {
  const { as, groupId, userId, robin } = await crew();
  const anonymous = await signIn(t, { isAnonymous: true });
  const testAccount = await signIn(t, { email: "Casey@EXAMPLE.TEST" });
  const noEmail = await signIn(t, {});
  await claimPlayers(groupId, [
    robin.userId,
    userId,
    anonymous.userId,
    testAccount.userId,
    noEmail.userId,
  ]);
  await as.mutation(api.sessions.schedule, { groupId, date });
  await settle();

  await at(dayDue);

  expect(
    reminders()
      .map(({ distinct_id }) => distinct_id)
      .sort(),
  ).toEqual([`next-session:${robin.userId}`, `next-session:${userId}`].sort());
});

describe("a Reminder", () => {
  it("never announces a change before its Undo window ends", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await vi.advanceTimersByTimeAsync(dayDue - UNDO_WINDOW_MS / 2 - Date.now());
    await saveTimeAndPlace(as, groupId, { startTime: "20:00" });
    await at(dayDue);

    expect(reminders()).toEqual([expect.objectContaining({ lead: "day", start_label: "19:00" })]);
  });
});

it("moves the pair with a saved Time and place and shows the new location", async () => {
  const { as, groupId } = await crew();
  await as.mutation(api.sessions.schedule, { groupId, date });
  await settle();

  await saveTimeAndPlace(as, groupId, { startTime: "20:00", location: "Max's place" });
  await settle();

  await at(start + HOUR);
  expect(reminders()).toEqual([
    expect.objectContaining({ lead: "day", start_label: "20:00", location: "Max's place" }),
    expect.objectContaining({ lead: "hours", start_label: "20:00", location: "Max's place" }),
  ]);
});

it("fires the moved pair at the new times", async () => {
  const { as, groupId } = await crew();
  await as.mutation(api.sessions.schedule, { groupId, date });
  await settle();
  await saveTimeAndPlace(as, groupId, { startTime: "20:00" });
  await settle();

  await at(dayDue);
  expect(leads()).toEqual([]);
  await at(dayDue + HOUR);
  expect(leads()).toEqual(["day"]);
  await at(hoursDue);
  expect(leads()).toEqual(["day"]);
  await at(hoursDue + HOUR);
  expect(leads()).toEqual(["day", "hours"]);
});

describe("Cancel, Undo and Schedule again", () => {
  it("reminds nobody of a Session cancelled after its window", async () => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await as.mutation(api.sessions.cancel, { sessionId });
    await settle();

    await at(start + HOUR);
    expect(reminders()).toEqual([]);
  });

  it.each([
    ["inside the cancel's window", 1_000],
    ["after the cancel settled", UNDO_WINDOW_MS + 1],
  ])("sends one pair, not two, for Cancel then Schedule again %s", async (_when, elapsed) => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await as.mutation(api.sessions.cancel, { sessionId });
    await vi.advanceTimersByTimeAsync(elapsed);
    await deliver();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await at(start + HOUR);
    expect(leads()).toEqual(["day", "hours"]);
  });

  it("reminds nobody when a Schedule again is undone inside its window", async () => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();
    await as.mutation(api.sessions.cancel, { sessionId });
    await settle();

    await as.mutation(api.sessions.schedule, { groupId, date });
    await vi.advanceTimersByTimeAsync(1_000);
    await as.mutation(api.sessions.cancel, { sessionId });
    await settle();

    await at(start + HOUR);
    expect(reminders()).toEqual([]);
  });

  it("reminds nobody of a new Session undone inside its first window", async () => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await vi.advanceTimersByTimeAsync(1_000);
    await as.mutation(api.sessions.cancel, { sessionId });
    await settle();

    await at(start + HOUR);
    expect(reminders()).toEqual([]);
  });
});

describe("recipients resolved when the Reminder fires", () => {
  it.each([
    ["turns Reminders off in My groups", "switch"],
    ["releases the Group", "release"],
    ["is removed by the GM", "removal"],
    ["loses the Group to deletion", "deletion"],
  ])("reminds nobody who %s before the due time", async (_change, change) => {
    const { as, groupId, robin } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    if (change === "switch") await robin.as.mutation(api.me.setReminders, { enabled: false });
    if (change === "release") await robin.as.mutation(api.player.release, { groupId });
    if (change === "removal")
      await as.mutation(api.roster.removePlayer, { playerId: await robinsPlayer(groupId) });
    if (change === "deletion") await as.mutation(api.groups.remove, { groupId });

    await at(start + HOUR);
    expect(reminders()).toEqual([]);
  });

  it("sends no 2-hour Reminder after the day Reminder's link turned Reminders off", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();
    await at(dayDue);

    const link = new URL(reminders()[0]!.reminders_off_url as string);
    await t.mutation(api.reminderLinks.turnOff, { token: link.searchParams.get("t")! });

    await at(start + HOUR);
    expect(leads()).toEqual(["day"]);
  });

  it("reminds an Account that claims a Player after the Session was published", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    const sam = await signIn(t, { email: "sam@example.com" });
    const playerId = await t.run(
      async (ctx) => await ctx.db.insert("players", { groupId, name: "Sam", nameKey: "sam" }),
    );
    await sam.as.mutation(api.player.claim, { shareToken: "share-token", playerId });

    await at(dayDue);
    expect(
      reminders()
        .map(({ email }) => email)
        .sort(),
    ).toEqual(["robin@example.com", "sam@example.com"]);
  });

  it("keeps the Account's Reminder link the same across Reminders", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await at(start + HOUR);
    const [day, hours] = reminders();
    expect(day!.reminders_off_url).toBe(hours!.reminders_off_url);
  });
});

describe("due times", () => {
  it.each([
    ["an hour", HOUR],
    ["2 minutes", 2 * 60_000],
  ])(
    "schedules only the 2-hour Reminder for a Session published %s after the day Reminder was due",
    async (_late, late) => {
      vi.setSystemTime(dayDue + late - UNDO_WINDOW_MS);
      const { as, groupId } = await crew();
      await as.mutation(api.sessions.schedule, { groupId, date });
      await settle();

      await at(start + HOUR);
      expect(leads()).toEqual(["hours"]);
    },
  );

  it("schedules no Reminder for a Session published less than 2 hours ahead", async () => {
    vi.setSystemTime(hoursDue + 10 * 60_000);
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await at(start + HOUR);
    expect(reminders()).toEqual([]);
  });

  it.each([
    [4, ["day", "hours"]],
    [6, ["hours"]],
  ])("a day Reminder run %i minutes late sends %j", async (minutesLate, expected) => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();
    await vi.advanceTimersByTimeAsync(dayDue - HOUR - Date.now());

    vi.setSystemTime(Date.now() + minutesLate * 60_000);
    await at(dayDue + minutesLate * 60_000);
    vi.setSystemTime(Date.now() - minutesLate * 60_000);

    await at(start + HOUR);
    expect(leads()).toEqual(expected);
  });
});

describe("built disabled", () => {
  it.each(["POSTHOG_REMINDER_WEBHOOK_URL", "POSTHOG_MAIL_WEBHOOK_SECRET"])(
    "schedules nothing and calls no webhook without %s, and still publishes",
    async (variable) => {
      vi.stubEnv(variable, "");
      const { as, groupId } = await crew();
      const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
      await settle();

      expect(await scheduledReminders()).toEqual([]);
      expect(await sessionRow(sessionId)).toMatchObject({ published: { state: "scheduled" } });
      vi.stubEnv(
        variable,
        variable === "POSTHOG_MAIL_WEBHOOK_SECRET" ? "secret" : REMINDER_WEBHOOK,
      );
      await at(start + HOUR);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("drops a scheduled Reminder when Reminders are switched off before it fires", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", "");
    await at(start + HOUR);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the switch-on backfill", () => {
  it("schedules one pair for each upcoming scheduled Session published before switch-on, even when run twice", async () => {
    vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", "");
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    const cancelledId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-18" });
    await settle();
    await as.mutation(api.sessions.cancel, { sessionId: cancelledId });
    await settle();

    vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", REMINDER_WEBHOOK);
    await t.mutation(internal.reminders.scheduleUpcoming, {});
    await deliver();
    await t.mutation(internal.reminders.scheduleUpcoming, {});
    await deliver();

    await at(Date.UTC(2026, 9, 19));
    expect(reminders().map(({ date_label, lead }) => [date_label, lead])).toEqual([
      ["Saturday, October 17, 2026", "day"],
      ["Saturday, October 17, 2026", "hours"],
    ]);
  });

  it("leaves a Session published after switch-on with its one pair", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await t.mutation(internal.reminders.scheduleUpcoming, {});
    await deliver();

    await at(start + HOUR);
    expect(leads()).toEqual(["day", "hours"]);
  });

  it("pages through more upcoming Sessions than one page holds", async () => {
    const groupIds = [(await crew()).groupId, (await crew()).groupId, (await crew()).groupId];
    const days = Array.from({ length: 20 }, (_, day) => day + 1);
    for (const groupId of groupIds) {
      for (const day of days) {
        const startsAt = Date.UTC(2026, 9, 8, 17) + day * 24 * HOUR;
        await publishedBeforeSwitchOn(groupId, isoDate(startsAt), startsAt);
      }
    }

    await t.mutation(internal.reminders.scheduleUpcoming, {});
    await deliver();

    expect(await scheduledReminders()).toHaveLength(2 * groupIds.length * days.length);
  });

  it("skips a Session whose Reminders are already behind it", async () => {
    vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", "");
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();
    vi.setSystemTime(hoursDue + 60_000);

    vi.stubEnv("POSTHOG_REMINDER_WEBHOOK_URL", REMINDER_WEBHOOK);
    await t.mutation(internal.reminders.scheduleUpcoming, {});
    await deliver();

    expect(await scheduledReminders()).toEqual([]);
  });
});

describe("delivery", () => {
  it("sends once after a 503 then a 200", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await at(dayDue);
    await at(dayDue + 60_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reminders()[0]).toEqual(reminders()[1]);
  });

  it.each([400, 404, 429])("drops a Reminder the webhook refuses with HTTP %i", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await at(dayDue + 3 * 60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["switch", "release"])(
    "rechecks the %s before retrying a failed send",
    async (change) => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const { as, groupId, robin } = await crew();
      fetchMock.mockImplementationOnce(async () => {
        if (change === "switch") await robin.as.mutation(api.me.setReminders, { enabled: false });
        if (change === "release") await robin.as.mutation(api.player.release, { groupId });
        return new Response(null, { status: 503 });
      });
      await as.mutation(api.sessions.schedule, { groupId, date });
      await settle();

      await at(dayDue + 3 * 60_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("counts one delivery per Reminder in the day's mail volume", async () => {
    const { as, groupId, userId } = await crew();
    await claimPlayers(groupId, [userId]);
    await as.mutation(api.sessions.schedule, { groupId, date });
    await settle();

    await at(dayDue);

    expect(await mailVolumeOn("2026-10-16")).toBe(2);
  });
});
