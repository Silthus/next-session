import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  newBackend,
  signedInGmWithGroup,
  signIn,
  type GmClient,
  type TestBackend,
} from "./model/test.setup";
import { UNDO_WINDOW_MS } from "./sessionLifecycle";

const SITE_URL = "http://localhost:5173";
const SERVED_AT = Date.UTC(2026, 9, 8, 9, 30);

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("SITE_URL", SITE_URL);
  vi.stubEnv("POSTHOG_SESSION_WEBHOOK_URL", "https://example.test/session");
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "secret");
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Crew = { as: GmClient; groupId: Id<"groups"> };

async function crew(name = "Thursday Crew"): Promise<Crew> {
  const gm = await signedInGmWithGroup(t);
  await gm.as.mutation(api.groups.rename, { groupId: gm.groupId, name });
  await gm.as.mutation(api.groups.updateSettings, {
    groupId: gm.groupId,
    startTime: "19:00",
    lengthMinutes: 240,
    timeZone: "Europe/Berlin",
    location: "Max's place",
  });
  await finish();
  return gm;
}

async function withClaimedAccount({ groupId }: Crew) {
  const account = await signIn(t, { email: "robin@example.com" });
  await t.run(async (ctx) => {
    await ctx.db.insert("players", {
      groupId,
      name: "Robin",
      nameKey: "robin",
      userId: account.userId,
    });
  });
}

async function shareTokenOf({ as, groupId }: Crew) {
  return (await as.query(api.groups.get, { groupId }))!.shareToken;
}

async function schedule({ as, groupId }: Crew, date: string) {
  return await as.mutation(api.sessions.schedule, { groupId, date });
}

async function cancel({ as }: Crew, sessionId: Id<"sessions">) {
  await as.mutation(api.sessions.cancel, { sessionId });
}

async function wait(milliseconds: number) {
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(milliseconds);
  await t.finishInProgressScheduledFunctions();
}

async function finish() {
  for (let step = 0; step < 4; step++) await wait(UNDO_WINDOW_MS + 1);
}

async function download(shareToken: string) {
  return await t.fetch(`/cal/s/${shareToken}.ics`);
}

async function downloadedEvents(shareToken: string) {
  const response = await download(shareToken);
  expect(response.status).toBe(200);
  return eventsIn(await response.text());
}

function unfolded(calendar: string) {
  return calendar.replace(/\r\n /g, "").split("\r\n");
}

function eventsIn(calendar: string) {
  const events: Record<string, string>[] = [];
  let event: Record<string, string> | null = null;
  for (const line of unfolded(calendar)) {
    if (line === "BEGIN:VEVENT") event = {};
    else if (line === "END:VEVENT") {
      events.push(event!);
      event = null;
    } else if (event !== null) {
      const separator = line.indexOf(":");
      event[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }
  return events;
}

async function feedUrlOf({ as }: { as: GmClient }) {
  return (await as.mutation(api.me.calendarFeed, {})).url;
}

async function fetchFeed(feedUrl: string) {
  return await t.fetch(new URL(feedUrl).pathname);
}

async function feedEvents(feedUrl: string) {
  const response = await fetchFeed(feedUrl);
  expect(response.status).toBe(200);
  return eventsIn(await response.text());
}

async function joinWithAccount({ as }: { as: GmClient }, group: Crew, name = "Robin") {
  await as.mutation(api.player.join, { shareToken: await shareTokenOf(group), name });
}

async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("");
}

function startsOf(events: Record<string, string>[]) {
  return events.map((event) => event.DTSTART);
}

function uidOf(sessionId: Id<"sessions">) {
  return `${sessionId}@next-session.link`;
}

describe("the calendar download", () => {
  it("answers with every upcoming scheduled Session of the Group as a calendar file", async () => {
    const group = await crew();
    const shareToken = await shareTokenOf(group);
    const october17 = await schedule(group, "2026-10-17");
    const october31 = await schedule(group, "2026-10-31");
    await finish();
    vi.setSystemTime(SERVED_AT);

    const response = await download(shareToken);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=900");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="next-session.ics"',
    );
    const calendar = await response.text();
    expect(unfolded(calendar)).toContain("X-WR-CALNAME:Thursday Crew");
    const shareLink = `${SITE_URL}/s/${shareToken}`;
    expect(eventsIn(calendar)).toEqual([
      {
        UID: uidOf(october17),
        SEQUENCE: "0",
        DTSTAMP: "20261008T093000Z",
        DTSTART: "20261017T170000Z",
        DTEND: "20261017T210000Z",
        SUMMARY: "Thursday Crew",
        LOCATION: "Max's place",
        DESCRIPTION: `Open the group on Next Session: ${shareLink}`,
        URL: shareLink,
        STATUS: "CONFIRMED",
      },
      expect.objectContaining({
        UID: uidOf(october31),
        DTSTART: "20261031T180000Z",
        DTEND: "20261031T220000Z",
      }),
    ]);
  });

  it("holds an empty calendar for a Group with nothing upcoming", async () => {
    const shareToken = await shareTokenOf(await crew());

    const response = await download(shareToken);

    expect(response.status).toBe(200);
    const calendar = await response.text();
    expect(unfolded(calendar)).toContain("X-WR-CALNAME:Thursday Crew");
    expect(eventsIn(calendar)).toEqual([]);
  });

  it("leaves out a Session inside its first Undo window", async () => {
    const group = await crew();
    const shareToken = await shareTokenOf(group);
    await schedule(group, "2026-10-17");

    await wait(UNDO_WINDOW_MS);
    expect(await downloadedEvents(shareToken)).toEqual([]);

    await wait(1);
    expect(startsOf(await downloadedEvents(shareToken))).toEqual(["20261017T170000Z"]);
  });

  it("shows the old time of a move until its Undo window ends", async () => {
    const group = await crew();
    const shareToken = await shareTokenOf(group);
    await schedule(group, "2026-10-17");
    await finish();

    await group.as.mutation(api.groups.updateSettings, {
      groupId: group.groupId,
      startTime: "20:00",
      lengthMinutes: 240,
      timeZone: "Europe/Berlin",
      location: "Max's place",
    });
    await wait(UNDO_WINDOW_MS);
    expect(startsOf(await downloadedEvents(shareToken))).toEqual(["20261017T170000Z"]);

    await wait(1);
    expect(startsOf(await downloadedEvents(shareToken))).toEqual(["20261017T180000Z"]);
  });

  it("leaves out Cancelled and past Sessions", async () => {
    const group = await crew();
    const shareToken = await shareTokenOf(group);
    await schedule(group, "2026-10-08");
    const cancelled = await schedule(group, "2026-10-10");
    await schedule(group, "2026-10-17");
    await finish();
    await cancel(group, cancelled);
    await finish();

    vi.setSystemTime(Date.UTC(2026, 9, 9, 0, 0, 1));

    expect(startsOf(await downloadedEvents(shareToken))).toEqual(["20261017T170000Z"]);
  });

  it("keeps a Session dated today", async () => {
    const group = await crew();
    const shareToken = await shareTokenOf(group);
    await schedule(group, "2026-10-08");
    await finish();

    vi.setSystemTime(Date.UTC(2026, 9, 8, 23, 59));

    expect(startsOf(await downloadedEvents(shareToken))).toEqual(["20261008T170000Z"]);
  });

  it.each([
    ["an unknown token", "UnknownTok"],
    ["a token outside the Share Token alphabet", "not.a.token"],
  ])("answers 404 with no body for %s", async (_, shareToken) => {
    await crew();

    const response = await download(shareToken);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("answers 404 with no body for a rotated-away token, even inside the rotation's Undo", async () => {
    const group = await crew();
    const rotatedAway = await shareTokenOf(group);
    await schedule(group, "2026-10-17");
    await finish();

    await group.as.mutation(api.groups.rotateShareToken, { groupId: group.groupId });

    const response = await download(rotatedAway);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(startsOf(await downloadedEvents(await shareTokenOf(group)))).toEqual([
      "20261017T170000Z",
    ]);
  });
});

describe("the calendar feed", () => {
  it("answers with the Sessions of every Group the Account runs or plays in", async () => {
    const run = await crew("Thursday Crew");
    const played = await crew("Sunday Table");
    await joinWithAccount(run, played);
    const runSession = await schedule(run, "2026-10-17");
    const playedSession = await schedule(played, "2026-10-18");
    await finish();
    const feedUrl = await feedUrlOf(run);
    vi.setSystemTime(SERVED_AT);

    const response = await fetchFeed(feedUrl);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=900");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    const calendar = await response.text();
    expect(unfolded(calendar)).toContain("X-WR-CALNAME:Next Session");
    const runLink = `${SITE_URL}/g/${run.groupId}`;
    const playedLink = `${SITE_URL}/me`;
    expect(eventsIn(calendar)).toEqual([
      {
        UID: uidOf(runSession),
        SEQUENCE: "0",
        DTSTAMP: "20261008T093000Z",
        DTSTART: "20261017T170000Z",
        DTEND: "20261017T210000Z",
        SUMMARY: "Thursday Crew",
        LOCATION: "Max's place",
        DESCRIPTION: `Open the group on Next Session: ${runLink}`,
        URL: runLink,
        STATUS: "CONFIRMED",
      },
      expect.objectContaining({
        UID: uidOf(playedSession),
        SUMMARY: "Sunday Table",
        DESCRIPTION: `Open the group on Next Session: ${playedLink}`,
        URL: playedLink,
      }),
    ]);
  });

  it("lists a Group the Account runs and plays in once, linked to its GM page", async () => {
    const group = await crew();
    await joinWithAccount(group, group);
    await schedule(group, "2026-10-17");
    await finish();

    expect((await feedEvents(await feedUrlOf(group))).map((event) => event.URL)).toEqual([
      `${SITE_URL}/g/${group.groupId}`,
    ]);
  });

  it("holds an empty calendar for an Account with nothing in the window", async () => {
    const response = await fetchFeed(await feedUrlOf(await crew()));

    expect(response.status).toBe(200);
    const calendar = await response.text();
    expect(unfolded(calendar)).toContain("X-WR-CALNAME:Next Session");
    expect(eventsIn(calendar)).toEqual([]);
  });

  it("keeps a Cancelled Session, marked cancelled", async () => {
    const group = await crew();
    const cancelled = await schedule(group, "2026-10-17");
    await finish();
    await cancel(group, cancelled);
    await finish();

    expect(await feedEvents(await feedUrlOf(group))).toEqual([
      expect.objectContaining({ UID: uidOf(cancelled), STATUS: "CANCELLED" }),
    ]);
  });

  it("keeps a Session from 31 days back and leaves out one from 32", async () => {
    vi.setSystemTime(Date.UTC(2026, 8, 6, 12));
    const group = await crew();
    await schedule(group, "2026-09-06");
    await schedule(group, "2026-09-07");
    await finish();
    const feedUrl = await feedUrlOf(group);

    vi.setSystemTime(SERVED_AT);

    expect(startsOf(await feedEvents(feedUrl))).toEqual(["20260907T170000Z"]);
  });

  it("reaches to the end of the Booking Window", async () => {
    const group = await crew();
    await schedule(group, "2026-12-31");
    await finish();

    expect(startsOf(await feedEvents(await feedUrlOf(group)))).toEqual(["20261231T180000Z"]);
  });

  it("leaves out a Session inside its first Undo window", async () => {
    const group = await crew();
    const feedUrl = await feedUrlOf(group);
    await schedule(group, "2026-10-17");

    await wait(UNDO_WINDOW_MS);
    expect(await feedEvents(feedUrl)).toEqual([]);

    await wait(1);
    expect(startsOf(await feedEvents(feedUrl))).toEqual(["20261017T170000Z"]);
  });

  it.each([
    ["the Account releases its Player", api.player.release],
    ["the Account removes it from My groups", api.player.removeFromMyGroups],
  ])("drops a Group the Account plays in once %s", async (_, leave) => {
    const account = await crew("Thursday Crew");
    const played = await crew("Sunday Table");
    await joinWithAccount(account, played);
    await schedule(played, "2026-10-17");
    await finish();
    const feedUrl = await feedUrlOf(account);

    await account.as.mutation(leave, { groupId: played.groupId });

    expect(await feedEvents(feedUrl)).toEqual([]);
  });

  it("drops a deleted Group at once, its Players still being removed", async () => {
    const account = await crew("Thursday Crew");
    const played = await crew("Sunday Table");
    await joinWithAccount(account, played);
    await schedule(account, "2026-10-17");
    await schedule(played, "2026-10-18");
    await finish();
    const feedUrl = await feedUrlOf(account);

    await account.as.mutation(api.groups.remove, { groupId: account.groupId });
    await played.as.mutation(api.groups.remove, { groupId: played.groupId });

    expect(await feedEvents(feedUrl)).toEqual([]);
  });

  it("answers 404 with no body for the old link after a reset, and serves the new one", async () => {
    const group = await crew();
    await schedule(group, "2026-10-17");
    await finish();
    const oldUrl = await feedUrlOf(group);

    const { url: newUrl } = await group.as.mutation(api.me.resetCalendarFeed, {});

    await expectNotFound(await fetchFeed(oldUrl));
    expect(startsOf(await feedEvents(newUrl))).toEqual(["20261017T170000Z"]);
  });

  it.each([
    ["an unknown token", "UnknownFeedToken123456"],
    ["a token outside the token alphabet", "not.a.token"],
  ])("answers 404 with no body for %s", async (_, feedToken) => {
    await feedUrlOf(await crew());

    await expectNotFound(await t.fetch(`/cal/a/${feedToken}.ics`));
  });
});

describe("feed scoping", () => {
  describe("every calendar file holds only the published Sessions its own token reaches", () => {
    it("through a Share Token", async () => {
      const ours = await crew("Thursday Crew");
      const theirs = await crew("Sunday Table");
      const ourSession = await schedule(ours, "2026-10-17");
      const theirSession = await schedule(theirs, "2026-10-17");
      const theirOtherSession = await schedule(theirs, "2026-10-24");
      await finish();
      const rotatedAway = await shareTokenOf(theirs);
      await theirs.as.mutation(api.groups.rotateShareToken, { groupId: theirs.groupId });

      const ourEvents = await downloadedEvents(await shareTokenOf(ours));
      const theirEvents = await downloadedEvents(await shareTokenOf(theirs));
      const rotatedAwayResponse = await download(rotatedAway);

      expect(ourEvents.map((event) => [event.UID, event.SUMMARY])).toEqual([
        [uidOf(ourSession), "Thursday Crew"],
      ]);
      expect(theirEvents.map((event) => [event.UID, event.SUMMARY])).toEqual([
        [uidOf(theirSession), "Sunday Table"],
        [uidOf(theirOtherSession), "Sunday Table"],
      ]);
      expect(rotatedAwayResponse.status).toBe(404);
      expect(await rotatedAwayResponse.text()).toBe("");
    });

    it("through a feed token", async () => {
      const ours = await crew("Thursday Crew");
      const played = await crew("Sunday Table");
      const theirs = await crew("Monday Night");
      await joinWithAccount(ours, played);
      await joinWithAccount(theirs, played, "Sam");
      const ourSession = await schedule(ours, "2026-10-17");
      const playedSession = await schedule(played, "2026-10-17");
      const theirSession = await schedule(theirs, "2026-10-17");
      await finish();
      const resetAway = await feedUrlOf(ours);
      const ourFeed = (await ours.as.mutation(api.me.resetCalendarFeed, {})).url;
      const theirFeed = await feedUrlOf(theirs);

      const ourCalendar = await (await fetchFeed(ourFeed)).text();
      const theirEvents = await feedEvents(theirFeed);

      expect(eventsIn(ourCalendar).map((event) => [event.UID, event.SUMMARY])).toEqual([
        [uidOf(ourSession), "Thursday Crew"],
        [uidOf(playedSession), "Sunday Table"],
      ]);
      expect(theirEvents.map((event) => [event.UID, event.SUMMARY])).toEqual([
        [uidOf(theirSession), "Monday Night"],
        [uidOf(playedSession), "Sunday Table"],
      ]);
      for (const group of [ours, played, theirs]) {
        expect(ourCalendar).not.toContain(await shareTokenOf(group));
      }
      await expectNotFound(await fetchFeed(resetAway));
    });
  });
});

describe("a rename", () => {
  it("reaches the download once its Undo window ends", async () => {
    const group = await crew();
    const shareToken = await shareTokenOf(group);
    await schedule(group, "2026-10-17");
    await finish();

    await group.as.mutation(api.groups.rename, { groupId: group.groupId, name: "Friday Crew" });
    await wait(UNDO_WINDOW_MS);
    expect((await downloadedEvents(shareToken)).map((event) => event.SUMMARY)).toEqual([
      "Thursday Crew",
    ]);

    await wait(1);
    expect((await downloadedEvents(shareToken)).map((event) => event.SUMMARY)).toEqual([
      "Friday Crew",
    ]);
  });

  it("leaves a Cancelled Session's published name alone and sends no Session update", async () => {
    const group = await crew();
    await withClaimedAccount(group);
    await schedule(group, "2026-10-17");
    const cancelled = await schedule(group, "2026-10-24");
    await finish();
    await cancel(group, cancelled);
    await finish();
    fetchMock.mockClear();

    await group.as.mutation(api.groups.rename, { groupId: group.groupId, name: "Friday Crew" });
    await finish();

    const published = await t.run(async (ctx) =>
      (await ctx.db.query("sessions").collect()).map((session) => session.published),
    );
    expect(published).toEqual([
      expect.objectContaining({ state: "scheduled", summary: "Friday Crew" }),
      expect.objectContaining({ state: "cancelled", summary: "Thursday Crew" }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
