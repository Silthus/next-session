import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requestMail } from "./mail";
import {
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signIn,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";
import { UNDO_WINDOW_MS } from "../shared/sessions";

const RESEND_URL = "https://api.resend.com/emails";
const POSTHOG_LOGS = "/i/v1/logs";
const date = "2026-10-17";

type ResendMail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  reply_to?: string;
  attachments: { filename: string; content: string; content_type: string }[];
};

type SentRequest = { url: string; at: number; headers: Headers; body: string };

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let sent: SentRequest[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("SITE_URL", "https://next-session.link");
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "secret");
  sent = [];
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: urlOf(input),
      at: Date.now(),
      headers: new Headers(init?.headers),
      body: init?.body as string,
    });
    return fetchMock(input, init);
  });
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

async function crew(signInGm?: Parameters<typeof signedInGmWithGroup>[1]) {
  const gm = await signedInGmWithGroup(t, signInGm);
  const robin = await signIn(t, { email: "robin@example.com" });
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", gm.groupId, {
      name: "Thursday Crew",
      shareToken: "crew-token",
      location: "Max's place",
    });
    await ctx.db.insert("players", {
      groupId: gm.groupId,
      name: "Robin",
      nameKey: "robin",
      userId: robin.userId,
    });
  });
  const gmEmail = await t.run(async (ctx) => (await ctx.db.get("users", gm.userId))!.email!);
  return { ...gm, gmEmail, robin };
}

async function claimOf(userId: Id<"users">) {
  return await t.run(
    async (ctx) =>
      (await ctx.db
        .query("players")
        .withIndex("by_userId_and_groupId", (q) => q.eq("userId", userId))
        .first())!._id,
  );
}

async function finish() {
  for (let step = 0; step < 8; step++) {
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function wait(milliseconds: number) {
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(milliseconds);
  await t.finishInProgressScheduledFunctions();
}

function resendRequests() {
  return sent.filter(({ url }) => url === RESEND_URL);
}

function resendMails() {
  return resendRequests().map(({ body }) => JSON.parse(body) as ResendMail);
}

function mailsTo(address: string) {
  return resendMails().filter(({ to }) => to.includes(address));
}

function mailTo(address: string) {
  const mails = mailsTo(address);
  expect(mails).toHaveLength(1);
  return mails[0]!;
}

function inviteOf(mail: ResendMail) {
  const [attachment] = mail.attachments;
  const bytes = Uint8Array.from(atob(attachment!.content), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function unfolded(calendar: string) {
  return calendar.replace(/\r\n /g, "");
}

function sequencesTo(address: string) {
  return resendMails()
    .filter(({ to }) => to.includes(address))
    .map((mail) => Number(/SEQUENCE:(\d+)/.exec(inviteOf(mail))![1]));
}

function uidsTo(address: string) {
  return resendMails()
    .filter(({ to }) => to.includes(address))
    .map((mail) => /UID:(.+)\r\n/.exec(inviteOf(mail))![1]);
}

function logLines(message: string) {
  return sent
    .filter(({ url }) => url.includes(POSTHOG_LOGS))
    .flatMap(({ body }) => {
      const { resourceLogs } = JSON.parse(body) as {
        resourceLogs: {
          scopeLogs: {
            logRecords: {
              body: { stringValue: string };
              attributes: { key: string; value: Record<string, unknown> }[];
            }[];
          }[];
        }[];
      };
      return resourceLogs.flatMap(({ scopeLogs }) =>
        scopeLogs.flatMap(({ logRecords }) => logRecords),
      );
    })
    .filter((record) => record.body.stringValue === message)
    .map(({ attributes }) =>
      Object.fromEntries(attributes.map(({ key, value }) => [key, Object.values(value)[0]])),
    );
}

it("mails every calendar recipient once after the Undo window, the GM included, and nobody before", async () => {
  const { as, groupId, userId, gmEmail, robin } = await crew();
  await t.run(async (ctx) => {
    await ctx.db.insert("players", {
      groupId,
      name: "Robin again",
      nameKey: "robin again",
      userId: robin.userId,
    });
    await ctx.db.insert("players", { groupId, name: "GM", nameKey: "gm", userId });
    await ctx.db.insert("players", { groupId, name: "Visitor", nameKey: "visitor" });
  });

  await as.mutation(api.sessions.schedule, { groupId, date });
  await wait(UNDO_WINDOW_MS);
  expect(resendRequests()).toEqual([]);
  await finish();

  expect(resendMails().map(({ to }) => to)).toEqual(
    expect.arrayContaining([[gmEmail], ["robin@example.com"]]),
  );
  expect(resendMails()).toHaveLength(2);
  expect(mailTo("robin@example.com")).toMatchObject({
    from: "Next Session <calendar@next-session.link>",
    subject: "Thursday Crew: next session Saturday, October 17, 2026",
    attachments: [
      { filename: "invite.ics", content_type: "text/calendar; charset=utf-8; method=REQUEST" },
    ],
  });
  expect(mailTo("robin@example.com")).not.toHaveProperty("reply_to");
  expect(mailTo(gmEmail).text).toContain("You set the next session for Thursday Crew");
  expect(resendRequests()[0]!.headers.get("Authorization")).toBe("Bearer re_test_key");
});

it("mails only the Group's calendar recipient set, rechecked on every attempt", async () => {
  const { as, groupId, gmEmail, robin } = await crew();
  const kim = await signIn(t, { email: "kim@example.com" });
  const stranger = await signIn(t, { email: "stranger@example.com" });
  const otherGroup = await signedInGmWithGroup(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("players", { groupId, name: "Kim", nameKey: "kim", userId: kim.userId });
    await ctx.db.insert("players", { groupId, name: "Visitor", nameKey: "visitor" });
    await ctx.db.insert("players", {
      groupId: otherGroup.groupId,
      name: "Stranger",
      nameKey: "stranger",
      userId: stranger.userId,
    });
  });
  let kimLeft = false;
  fetchMock.mockImplementation(async (_url, init) => {
    if (kimLeft || !(init!.body as string).includes("kim@example.com"))
      return new Response(null, { status: 200 });
    kimLeft = true;
    await kim.as.mutation(api.player.release, { groupId });
    return new Response(null, { status: 503 });
  });

  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  const robinPlayer = await claimOf(robin.userId);
  await robin.as.mutation(api.player.release, { groupId });
  await robin.as.mutation(api.player.claim, { shareToken: "crew-token", playerId: robinPlayer });
  await finish();

  const set = "Thursday Crew: next session Saturday, October 17, 2026";
  const removed = "Thursday Crew: session on Saturday, October 17, 2026 removed from your calendar";
  expect(resendMails().map(({ to, subject }) => `${to[0]} ${subject}`)).toEqual(
    expect.arrayContaining([
      `${gmEmail} ${set}`,
      `kim@example.com ${set}`,
      `robin@example.com ${set}`,
      `kim@example.com ${removed}`,
    ]),
  );
  expect(mailsTo("robin@example.com").map(({ subject }) => subject)).toEqual([set, set]);
  expect(resendMails()).toHaveLength(5);
});

it("puts the night into each calendar as an accepted invite without an alarm and with a token-free link", async () => {
  const { as, groupId, gmEmail } = await crew();

  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  const player = unfolded(inviteOf(mailTo("robin@example.com")));
  for (const line of [
    "METHOD:REQUEST",
    `UID:${sessionId}@next-session.link`,
    "SEQUENCE:1",
    "DTSTART:20261017T170000Z",
    "DTEND:20261017T210000Z",
    "SUMMARY:Thursday Crew",
    "LOCATION:Max's place",
    "URL:https://next-session.link/me",
    "STATUS:CONFIRMED",
    "ORGANIZER;CN=Next Session:mailto:calendar@next-session.link",
    "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:robin@example.com",
  ])
    expect(player).toContain(`${line}\r\n`);
  expect(player).not.toContain("VALARM");
  expect(player).not.toContain("crew-token");
  expect(unfolded(inviteOf(mailTo(gmEmail)))).toContain(
    `URL:https://next-session.link/g/${groupId}\r\n`,
  );
});

it("takes a cancelled night out of every calendar", async () => {
  const { as, groupId, gmEmail } = await crew();
  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  sent = [];

  await as.mutation(api.sessions.cancel, { sessionId });
  await finish();

  for (const address of [gmEmail, "robin@example.com"]) {
    const mail = mailTo(address);
    expect(mail.subject).toBe("Thursday Crew: session on Saturday, October 17, 2026 cancelled");
    expect(mail.attachments[0]!.content_type).toBe("text/calendar; charset=utf-8; method=CANCEL");
    const calendar = inviteOf(mail);
    expect(calendar).toContain("METHOD:CANCEL\r\n");
    expect(calendar).toContain("STATUS:CANCELLED\r\n");
  }
});

it("raises SEQUENCE for every recipient across set, change, cancel and Schedule again under one UID", async () => {
  const { as, groupId, gmEmail } = await crew();
  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  await as.mutation(api.groups.updateSettings, {
    groupId,
    startTime: "20:00",
    lengthMinutes: 180,
    timeZone: "Europe/Berlin",
    location: "Max's place",
  });
  await finish();
  await as.mutation(api.sessions.cancel, { sessionId });
  await finish();
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  for (const address of [gmEmail, "robin@example.com"]) {
    expect(sequencesTo(address)).toEqual([1, 2, 3, 4]);
    expect(new Set(uidsTo(address))).toEqual(new Set([`${sessionId}@next-session.link`]));
  }
  expect(resendMails().map(({ subject }) => subject.split(": ")[1])).toEqual([
    "next session Saturday, October 17, 2026",
    "next session Saturday, October 17, 2026",
    "session on Saturday, October 17, 2026 changed",
    "session on Saturday, October 17, 2026 changed",
    "session on Saturday, October 17, 2026 cancelled",
    "session on Saturday, October 17, 2026 cancelled",
    "next session Saturday, October 17, 2026",
    "next session Saturday, October 17, 2026",
  ]);
});

it("gives the Calendar download and feed the SEQUENCE of the night's last invite", async () => {
  const { as, groupId } = await crew();
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  await as.mutation(api.groups.updateSettings, {
    groupId,
    startTime: "20:00",
    lengthMinutes: 180,
    timeZone: "Europe/Berlin",
    location: "Max's place",
  });
  await finish();
  const { url: feedUrl } = await as.mutation(api.me.calendarFeed, {});

  const download = await t.fetch("/cal/s/crew-token.ics");
  const feed = await t.fetch(new URL(feedUrl).pathname);

  expect(sequencesIn(await download.text())).toEqual([2]);
  expect(sequencesIn(await feed.text())).toEqual([2]);
});

function sequencesIn(calendar: string) {
  return [...unfolded(calendar).matchAll(/^SEQUENCE:(\d+)\r$/gm)].map(([, value]) => Number(value));
}

it("spaces the sends of one fan-out at least 500 ms apart", async () => {
  const { as, groupId } = await crew();
  await t.run(async (ctx) => {
    for (const name of ["Ash", "Kim"]) {
      const userId = await ctx.db.insert("users", { email: `${name}@example.com` });
      await ctx.db.insert("players", { groupId, name, nameKey: name, userId });
    }
  });

  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  const times = resendRequests().map(({ at }) => at);
  expect(times).toHaveLength(4);
  for (let index = 1; index < times.length; index++)
    expect(times[index]! - times[index - 1]!).toBeGreaterThanOrEqual(500);
});

it("links the footer's My groups to the deployment's own site", async () => {
  vi.stubEnv("SITE_URL", "https://preview.next-session.test");
  const { as, groupId } = await crew();

  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  const { text, html } = mailTo("robin@example.com");
  expect(text).toContain(
    "Turn session emails off in My groups: https://preview.next-session.test/me.",
  );
  expect(html).toContain('<a href="https://preview.next-session.test/me"');
});

describe("delivery", () => {
  const ROBIN = "robin@example.com";
  const gmAlone = () => signedInGmWithGroup(t);

  it("drops a retry whose revision is no longer the published one", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { as, groupId } = await gmAlone();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(
        new Response(null, {
          status: (init!.body as string).includes("cancelled") ? 503 : 200,
        }),
      ),
    );

    await as.mutation(api.sessions.cancel, { sessionId });
    await wait(UNDO_WINDOW_MS + 1);
    for (let hop = 0; hop < 8; hop++) await wait(1);
    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(resendMails().map(({ subject }) => subject.split(" ").at(-1))).toEqual([
      "2026",
      "cancelled",
      "cancelled",
      "2026",
    ]);
  });

  it("sends a 503 then 200 once, the same request under one Idempotency-Key", async () => {
    const { as, groupId, userId } = await gmAlone();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    const [key, retryKey] = resendRequests().map(({ headers }) => headers.get("Idempotency-Key"));
    expect(key).toMatch(
      new RegExp(`^calendar/${sessionId}@next-session\\.link/1/${userId}/[0-9a-f]{16}$`),
    );
    expect(retryKey).toBe(key);
    const [first, retry] = resendRequests();
    expect(retry!.at).toBeGreaterThan(first!.at);
    expect(retry!.body).toBe(first!.body);
  });

  function failingRobinOnce() {
    const accepted: string[] = [];
    const bodiesByKey = new Map<string, string>();
    let robinFailed = false;
    fetchMock.mockImplementation((_url, init) => {
      const key = new Headers(init!.headers).get("Idempotency-Key")!;
      const body = init!.body as string;
      const first = bodiesByKey.get(key) ?? body;
      bodiesByKey.set(key, first);
      if (first !== body) return Promise.resolve(new Response(null, { status: 409 }));
      if (body.includes(ROBIN) && !robinFailed) {
        robinFailed = true;
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      accepted.push(body);
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    return () => accepted.map((body) => JSON.parse(body) as ResendMail);
  }

  async function publishedWithRobinRetrying() {
    const gm = await crew();
    const accepted = failingRobinOnce();
    await gm.as.mutation(api.sessions.schedule, { groupId: gm.groupId, date });
    await wait(UNDO_WINDOW_MS + 1);
    await wait(1_000);
    return {
      ...gm,
      acceptedTo: (address: string) => accepted().filter(({ to }) => to.includes(address)),
    };
  }

  it("still delivers a retry after the Share Token rotates, under a key that matches its new body", async () => {
    const { as, groupId, acceptedTo } = await publishedWithRobinRetrying();

    await as.mutation(api.groups.rotateShareToken, { groupId });
    await finish();

    const [mail, ...more] = acceptedTo(ROBIN);
    expect(more).toEqual([]);
    expect(mail!.text).not.toContain("crew-token");
  });

  it("names the night's time in the zone it was published in when the zone changes before a retry", async () => {
    const { as, groupId, acceptedTo } = await publishedWithRobinRetrying();

    await as.mutation(api.groups.updateSettings, {
      groupId,
      startTime: "19:00",
      lengthMinutes: 240,
      timeZone: "Pacific/Auckland",
      location: "Max's place",
    });
    await finish();

    expect(acceptedTo(ROBIN)[0]!.text.split("\n")[0]).toBe(
      "The next session for Thursday Crew is set: Saturday, October 17, 2026, 19:00–23:00, Berlin time.",
    );
  });

  it("logs a 422 without the recipient and does not retry it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { as, groupId } = await crew();
    fetchMock.mockResolvedValue(new Response(null, { status: 422 }));

    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(resendRequests()).toHaveLength(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("422"));
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/example\.com|Thursday Crew/);
  });
});

it.each(["Session mail off", "a .test address"])(
  "mails nothing to an Account with %s",
  async (setting) => {
    const { as, groupId, gmEmail, robin } = await crew();
    if (setting === "Session mail off")
      await robin.as.mutation(api.me.setSessionEmails, { enabled: false });
    else
      await t.run(async (ctx) => {
        await ctx.db.patch("users", robin.userId, { email: "Robin@EXAMPLE.TEST" });
      });

    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(resendMails().flatMap(({ to }) => to)).toEqual([gmEmail]);
  },
);

it("mails nothing to an Anonymous GM", async () => {
  const { as, groupId } = await crew(signInAnonymousGm);

  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  expect(resendMails().flatMap(({ to }) => to)).toEqual(["robin@example.com"]);
});

it("publishes without RESEND_API_KEY but mails nobody and counts nothing, whatever Workflows has set", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  for (const workflow of ["WELCOME", "TIPS", "REMINDER"])
    vi.stubEnv(`POSTHOG_${workflow}_WEBHOOK_URL`, `https://example.test/${workflow}`);
  const { as, groupId } = await crew();

  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  expect(await t.run(async (ctx) => await ctx.db.get("sessions", sessionId))).toMatchObject({
    published: { state: "scheduled", revision: 1 },
  });
  expect(sent).toEqual([]);
  expect(await t.run(async (ctx) => await ctx.db.query("mailVolume").first())).toBeNull();
});

describe("mail volume", () => {
  beforeEach(() => vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-project-token"));

  function volumeWarnings() {
    return logLines("Daily mail volume warning");
  }

  it("counts and warns Resend sends apart from Workflows sends", async () => {
    vi.stubEnv("POSTHOG_WELCOME_WEBHOOK_URL", "https://example.test/welcome");
    const { as, groupId } = await signedInGmWithGroup(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 79; index++) {
        const userId = await ctx.db.insert("users", { email: `player-${index}@example.com` });
        await ctx.db.insert("players", {
          groupId,
          name: `Player ${index}`,
          nameKey: `${index}`,
          userId,
        });
      }
    });

    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "new@example.com" });
      await requestMail(ctx, { kind: "welcome", user: (await ctx.db.get("users", userId))! });
    });
    await finish();

    expect(resendRequests()).toHaveLength(80);
    expect(volumeWarnings()).toEqual([
      expect.objectContaining({ provider: "resend", estimated_deliveries: 80, daily_limit: 100 }),
    ]);
  });

  it("warns as Resend sends reach 80 and pass 100 across Groups, without dropping a recipient", async () => {
    for (const [groupIndex, players] of [79, 20].entries()) {
      const { as, groupId } = await signedInGmWithGroup(t);
      await t.run(async (ctx) => {
        for (let index = 0; index < players; index++) {
          const userId = await ctx.db.insert("users", {
            email: `player-${groupIndex}-${index}@example.com`,
          });
          await ctx.db.insert("players", {
            groupId,
            name: `Player ${index}`,
            nameKey: `${index}`,
            userId,
          });
        }
      });
      await as.mutation(api.sessions.schedule, { groupId, date });
      await finish();
    }

    expect(resendRequests()).toHaveLength(101);
    expect(volumeWarnings()).toEqual([
      expect.objectContaining({ provider: "resend", estimated_deliveries: 80 }),
      expect.objectContaining({ provider: "resend", estimated_deliveries: 101, daily_limit: 100 }),
    ]);
  });

  it("reads a day counted before providers as Workflows", async () => {
    vi.stubEnv("POSTHOG_WELCOME_WEBHOOK_URL", "https://example.test/welcome");
    await t.run(async (ctx) => {
      await ctx.db.insert("mailVolume", { day: "2026-10-07", count: 79 });
      const userId = await ctx.db.insert("users", { email: "new@example.com" });
      await requestMail(ctx, { kind: "welcome", user: (await ctx.db.get("users", userId))! });
    });
    await finish();

    expect(volumeWarnings()).toEqual([
      expect.objectContaining({ provider: "workflows", estimated_deliveries: 80 }),
    ]);
  });

  it("keeps emails, Group names and Share Tokens out of usage events and logs", async () => {
    const { as, groupId, gmEmail } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();
    await as.mutation(api.sessions.cancel, { sessionId });
    await finish();

    const telemetry = sent.filter(({ url }) => url !== RESEND_URL);
    expect(telemetry.length).toBeGreaterThan(0);
    for (const { body } of telemetry)
      for (const secret of [gmEmail, "robin@example.com", "Thursday Crew", "crew-token"])
        expect(body).not.toContain(secret);
  });
});

describe("the calendar follows the Roster", () => {
  const SHARE_TOKEN = "crew-token";
  const KIM = "kim@example.com";
  const ROBIN = "robin@example.com";
  const WITHDRAWN = (day: string) =>
    `You don't keep Thursday Crew any more, so its session on Saturday, October ${day}, 2026 leaves your calendar.`;
  const INVITED = (day: string) =>
    `You keep Thursday Crew now, so its session is in your calendar: Saturday, October ${day}, 2026, 19:00–23:00, Berlin time.`;

  async function crewWithNights() {
    const gm = await crew();
    const { as, groupId } = gm;
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" });
    const cancelled = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-31" });
    await finish();
    await as.mutation(api.sessions.cancel, { sessionId: cancelled });
    await finish();
    sent = [];
    return gm;
  }

  async function unclaimedPlayer(groupId: Id<"groups">, name: string) {
    return await t.run(
      async (ctx) => await ctx.db.insert("players", { groupId, name, nameKey: name.toLowerCase() }),
    );
  }

  function firstLinesTo(address: string) {
    return resendMails()
      .filter(({ to }) => to.includes(address))
      .map(({ text }) => text.split("\n")[0]);
  }

  type Keeper = Awaited<ReturnType<typeof signIn>>;

  const KEEPS: Record<string, (kim: Keeper, groupId: Id<"groups">) => Promise<unknown>> = {
    "Join while signed in": (kim) =>
      kim.as.mutation(api.player.join, { shareToken: SHARE_TOKEN, name: "Kim" }),
    "Keep this group": async (kim, groupId) =>
      kim.as.mutation(api.player.claim, {
        shareToken: SHARE_TOKEN,
        playerId: await unclaimedPlayer(groupId, "Kim"),
      }),
    "the auto-keep on answer": async (kim, groupId) =>
      kim.as.mutation(api.player.answer, {
        shareToken: SHARE_TOKEN,
        playerId: await unclaimedPlayer(groupId, "Kim"),
        date: "2026-10-20",
        answer: "free",
      }),
  };

  it.each(Object.keys(KEEPS))(
    "invites a Player who keeps the Group through %s to each upcoming published scheduled Session",
    async (keep) => {
      const { as, groupId } = await crewWithNights();
      await seedSession(t, groupId, "2026-10-01", {
        published: {
          state: "scheduled",
          start: Date.UTC(2026, 9, 1, 17),
          end: Date.UTC(2026, 9, 1, 21),
          summary: "Thursday Crew",
          revision: 1,
        },
      });
      await as.mutation(api.sessions.schedule, { groupId, date: "2026-11-07" });
      const kim = await signIn(t, { email: KIM });

      await KEEPS[keep]!(kim, groupId);
      await finish();

      expect(firstLinesTo(KIM)).toEqual([
        INVITED("17"),
        INVITED("24"),
        "The next session for Thursday Crew is set: Saturday, November 7, 2026, 19:00–23:00, Berlin time.",
      ]);
      expect(sequencesTo(KIM)).toEqual([2, 2, 1]);
      const [invite] = resendMails().filter(({ to }) => to.includes(KIM));
      expect(invite).toMatchObject({
        subject: "Thursday Crew: next session Saturday, October 17, 2026",
        attachments: [{ content_type: "text/calendar; charset=utf-8; method=REQUEST" }],
      });
      expect(invite!.text).toContain("Where: Max's place\n");
      expect(unfolded(inviteOf(invite!))).toContain(
        `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${KIM}\r\n`,
      );
    },
  );

  type Crew = Awaited<ReturnType<typeof crew>>;

  const LEAVES: Record<string, (crew: Crew) => Promise<unknown>> = {
    "Not you?": ({ robin, groupId }) => robin.as.mutation(api.player.release, { groupId }),
    "Remove from my groups": ({ robin, groupId }) =>
      robin.as.mutation(api.player.removeFromMyGroups, { groupId }),
    "the GM removing the Player": async ({ as, robin }) =>
      as.mutation(api.roster.removePlayer, { playerId: await claimOf(robin.userId) }),
  };

  it.each(Object.keys(LEAVES))(
    "withdraws each upcoming published Session from a Player who leaves through %s",
    async (leave) => {
      const gm = await crewWithNights();

      await LEAVES[leave]!(gm);
      await finish();

      expect(resendMails().flatMap(({ to }) => to)).toEqual([ROBIN, ROBIN, ROBIN]);
      expect(firstLinesTo(ROBIN)).toEqual([WITHDRAWN("17"), WITHDRAWN("24"), WITHDRAWN("31")]);
      expect(sequencesTo(ROBIN)).toEqual([2, 2, 3]);
      for (const mail of resendMails()) {
        expect(mail.subject).toMatch(/removed from your calendar$/);
        expect(mail.attachments[0]!.content_type).toBe(
          "text/calendar; charset=utf-8; method=CANCEL",
        );
        const calendar = unfolded(inviteOf(mail));
        expect(calendar).toContain("METHOD:CANCEL\r\n");
        expect(calendar).toContain(
          `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${ROBIN}\r\n`,
        );
        expect(calendar).not.toContain("STATUS:");
        expect(calendar).not.toContain("crew-token");
      }
    },
  );

  it("still withdraws the night as it was at the release after a change and the Group's deletion", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { as, groupId, gmEmail, robin } = await crewWithNights();
    let groupDeleted = false;
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(null, { status: groupDeleted ? 200 : 503 })),
    );

    await robin.as.mutation(api.player.release, { groupId });
    await as.mutation(api.groups.updateSettings, {
      groupId,
      startTime: "20:00",
      lengthMinutes: 180,
      timeZone: "Europe/Berlin",
      location: "Max's place",
    });
    await as.mutation(api.groups.rename, { groupId, name: "Friday Crew" });
    await wait(UNDO_WINDOW_MS + 1);
    await wait(1_000);
    await as.mutation(api.groups.remove, { groupId });
    groupDeleted = true;
    const deletedAt = Date.now();
    await finish();

    expect(
      resendMails().some(
        ({ to, subject }) => to[0] === gmEmail && subject.startsWith("Friday Crew"),
      ),
    ).toBe(true);
    const afterDeletion = resendRequests()
      .filter(({ at, body }) => at >= deletedAt && body.includes(ROBIN))
      .map(({ body }) => JSON.parse(body) as ResendMail);
    expect(afterDeletion.map(({ subject }) => subject)).toEqual([
      "Thursday Crew: session on Saturday, October 17, 2026 removed from your calendar",
      "Thursday Crew: session on Saturday, October 24, 2026 removed from your calendar",
      "Thursday Crew: session on Saturday, October 31, 2026 removed from your calendar",
    ]);
    const night = unfolded(inviteOf(afterDeletion[0]!));
    expect(night).toContain("DTSTART:20261017T170000Z\r\n");
    expect(night).toContain("DTEND:20261017T210000Z\r\n");
    expect(night).toContain("SUMMARY:Thursday Crew\r\n");
  });

  it("drops a withdrawal when the Player keeps the Group again before it sends", async () => {
    const { groupId, robin } = await crewWithNights();
    const playerId = await claimOf(robin.userId);

    await robin.as.mutation(api.player.release, { groupId });
    await robin.as.mutation(api.player.claim, { shareToken: SHARE_TOKEN, playerId });
    await finish();

    expect(firstLinesTo(ROBIN)).toEqual([INVITED("17"), INVITED("24")]);
    expect(sequencesTo(ROBIN)).toEqual([3, 3]);
  });

  it("drops an invite when the Player leaves before it sends", async () => {
    const { groupId } = await crewWithNights();
    const kim = await signIn(t, { email: KIM });

    await kim.as.mutation(api.player.join, { shareToken: SHARE_TOKEN, name: "Kim" });
    await kim.as.mutation(api.player.release, { groupId });
    await finish();

    expect(firstLinesTo(KIM)).toEqual([WITHDRAWN("17"), WITHDRAWN("24"), WITHDRAWN("31")]);
  });

  it("lets a claim's invite leave another recipient's pending broadcast retry alone", async () => {
    const { as, groupId } = await crew();
    const kim = await signIn(t, { email: KIM });
    let robinFailedOnce = false;
    fetchMock.mockImplementation(async (_url, init) => {
      if (robinFailedOnce || !(init!.body as string).includes(ROBIN))
        return new Response(null, { status: 200 });
      robinFailedOnce = true;
      await kim.as.mutation(api.player.join, { shareToken: SHARE_TOKEN, name: "Kim" });
      return new Response(null, { status: 503 });
    });

    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(robinFailedOnce).toBe(true);
    expect(firstLinesTo(ROBIN)).toEqual([
      "The next session for Thursday Crew is set: Saturday, October 17, 2026, 19:00–23:00, Berlin time.",
      "The next session for Thursday Crew is set: Saturday, October 17, 2026, 19:00–23:00, Berlin time.",
    ]);
    expect(sequencesTo(ROBIN)).toEqual([1, 1]);
    expect(firstLinesTo(KIM)).toEqual([INVITED("17")]);
    expect(sequencesTo(KIM)).toEqual([2]);
  });

  it("sends nothing when a Player switches to another name in the same Group", async () => {
    const { groupId, robin } = await crewWithNights();

    await robin.as.mutation(api.player.claim, {
      shareToken: SHARE_TOKEN,
      playerId: await unclaimedPlayer(groupId, "Robin Two"),
    });
    await finish();

    expect(resendRequests()).toEqual([]);
  });

  it("sends nothing when the GM releases their own Player", async () => {
    const { as, groupId } = await crewWithNights();

    await as.mutation(api.player.join, { shareToken: SHARE_TOKEN, name: "Max" });
    await as.mutation(api.player.release, { groupId });
    await finish();

    expect(resendRequests()).toEqual([]);
  });

  it("invites the Account that Saves the Group to each upcoming published scheduled Session", async () => {
    const anonymous = await crew(signInAnonymousGm);
    const { groupId } = anonymous;
    await anonymous.as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    await anonymous.as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" });
    const cancelled = await anonymous.as.mutation(api.sessions.schedule, {
      groupId,
      date: "2026-10-31",
    });
    await finish();
    await anonymous.as.mutation(api.sessions.cancel, { sessionId: cancelled });
    await finish();
    sent = [];
    const account = await signIn(t, { email: "saved-gm@example.com" });

    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    await account.as.mutation(api.account.finishSave, { code });
    await finish();

    expect(resendMails().flatMap(({ to }) => to)).toEqual([
      "saved-gm@example.com",
      "saved-gm@example.com",
    ]);
    expect(firstLinesTo("saved-gm@example.com")).toEqual([
      "Thursday Crew is yours now, so its session is in your calendar: Saturday, October 17, 2026, 19:00–23:00, Berlin time.",
      "Thursday Crew is yours now, so its session is in your calendar: Saturday, October 24, 2026, 19:00–23:00, Berlin time.",
    ]);
    expect(unfolded(inviteOf(resendMails()[0]!))).toContain(
      `URL:https://next-session.link/g/${groupId}\r\n`,
    );
  });

  it("lets an Account Save 26 Groups with 20 published nights each, and invites it to every night", async () => {
    t = newBackend({ transactionLimits: true });
    const anonymous = await signedInGmWithGroup(t, signInAnonymousGm);
    const groupIds = await t.run(async (ctx) => {
      const { name, ownerId, expiresAt } = (await ctx.db.get("groups", anonymous.groupId))!;
      const ids = [anonymous.groupId];
      for (let index = 1; index < 26; index++)
        ids.push(
          await ctx.db.insert("groups", { name, ownerId, expiresAt, shareToken: `group-${index}` }),
        );
      return ids;
    });
    for (const groupId of groupIds)
      for (let day = 10; day < 30; day++)
        await seedSession(t, groupId, `2026-10-${day}`, {
          published: {
            state: "scheduled",
            start: Date.UTC(2026, 9, day, 17),
            end: Date.UTC(2026, 9, day, 21),
            summary: "Thursday Crew",
            revision: 1,
          },
        });
    const account = await signIn(t, { email: "saved-gm@example.com" });

    const { code } = await anonymous.as.mutation(api.account.startSave, {});
    await account.as.mutation(api.account.finishSave, { code });
    await finish();

    expect(mailsTo("saved-gm@example.com")).toHaveLength(26 * 20);
  });

  it.each(["Session mail off", "a .test address"])(
    "neither invites nor withdraws an Account with %s",
    async (setting) => {
      const { groupId } = await crewWithNights();
      const kim = await signIn(
        t,
        setting === "Session mail off"
          ? { email: KIM, sessionEmailsEnabled: false }
          : { email: "kim@example.test" },
      );

      await kim.as.mutation(api.player.join, { shareToken: SHARE_TOKEN, name: "Kim" });
      await finish();
      await kim.as.mutation(api.player.release, { groupId });
      await finish();

      expect(resendRequests()).toEqual([]);
    },
  );

  it("names an invite's time in the zone of the night it carries while a zone change waits out its Undo window", async () => {
    const { as, groupId } = await crewWithNights();
    await as.mutation(api.groups.updateSettings, {
      groupId,
      startTime: "19:00",
      lengthMinutes: 240,
      timeZone: "Pacific/Auckland",
      location: "Max's place",
    });
    const kim = await signIn(t, { email: KIM });

    await kim.as.mutation(api.player.join, { shareToken: SHARE_TOKEN, name: "Kim" });
    await finish();

    expect(firstLinesTo(KIM).slice(0, 2)).toEqual([INVITED("17"), INVITED("24")]);
  });

  it("puts every upcoming scheduled night of its Groups in the calendar of an Account that turns Session mail back on", async () => {
    const { as, groupId, gmEmail, robin } = await crewWithNights();
    await robin.as.mutation(api.me.setSessionEmails, { enabled: false });
    await as.mutation(api.me.setSessionEmails, { enabled: false });
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-11-07" });
    await finish();
    sent = [];

    await robin.as.mutation(api.me.setSessionEmails, { enabled: true });
    await as.mutation(api.me.setSessionEmails, { enabled: true });
    await finish();

    const nextSessions = [
      "Thursday Crew: next session Saturday, October 17, 2026",
      "Thursday Crew: next session Saturday, October 24, 2026",
      "Thursday Crew: next session Saturday, November 7, 2026",
    ];
    for (const address of [ROBIN, gmEmail])
      expect(mailsTo(address).map(({ subject }) => subject)).toEqual(nextSessions);
    expect(resendMails().every(({ attachments }) => attachments.length === 1)).toBe(true);
  });

  it("puts the nights in the calendar again at most twice a day for an Account that keeps toggling Session mail", async () => {
    const { robin } = await crewWithNights();

    for (let toggle = 0; toggle < 3; toggle++) {
      await robin.as.mutation(api.me.setSessionEmails, { enabled: false });
      await robin.as.mutation(api.me.setSessionEmails, { enabled: true });
    }
    await finish();

    expect(firstLinesTo(ROBIN)).toHaveLength(2 * 2);
    expect((await robin.as.query(api.me.notificationSettings, {}))?.sessionEmails).toBe(true);
  });

  async function secondGroupWithNights(ownerId: Id<"users">) {
    const groupId = await t.run(
      async (ctx) =>
        await ctx.db.insert("groups", { name: "Thursday Crew", ownerId, shareToken: "second" }),
    );
    for (const day of [18, 25])
      await seedSession(t, groupId, `2026-10-${day}`, {
        published: {
          state: "scheduled",
          start: Date.UTC(2026, 9, day, 17),
          end: Date.UTC(2026, 9, day, 21),
          summary: "Thursday Crew",
          revision: 1,
        },
      });
  }

  it("spaces the nights of every Group of an Account that turns Session mail back on as one row of sends", async () => {
    const { as, userId, gmEmail } = await crewWithNights();
    await secondGroupWithNights(userId);
    await as.mutation(api.me.setSessionEmails, { enabled: false });

    await as.mutation(api.me.setSessionEmails, { enabled: true });
    await finish();

    const times = resendRequests().map(({ at }) => at);
    expect(mailsTo(gmEmail)).toHaveLength(4);
    expect(times.slice(1).map((at, index) => at - times[index]! >= 500)).toEqual(
      Array(3).fill(true),
    );
  });

  it("waits for the next UTC midnight once the day's share of Resend sends is spent", async () => {
    const { as, gmEmail } = await crewWithNights();
    await t.run(async (ctx) => {
      for (const day of await ctx.db.query("mailVolume").collect())
        await ctx.db.patch("mailVolume", day._id, { count: 49 });
    });
    await as.mutation(api.me.setSessionEmails, { enabled: false });

    await as.mutation(api.me.setSessionEmails, { enabled: true });
    await finish();
    expect(mailsTo(gmEmail)).toEqual([]);

    await wait(Date.UTC(2026, 9, 8) - Date.now());
    await finish();
    expect(mailsTo(gmEmail)).toHaveLength(2);
  });

  it("sends nothing when an Account with Session mail on turns it on again", async () => {
    const { robin } = await crewWithNights();

    await robin.as.mutation(api.me.setSessionEmails, { enabled: true });
    await finish();

    expect(resendRequests()).toEqual([]);
  });

  it("drops a pending withdrawal once the Account turns Session mail off", async () => {
    const { groupId, robin } = await crewWithNights();

    await robin.as.mutation(api.player.release, { groupId });
    await robin.as.mutation(api.me.setSessionEmails, { enabled: false });
    await finish();

    expect(resendRequests()).toEqual([]);
  });
});

describe("the one-time invites", () => {
  const ROBIN = "robin@example.com";
  const FINISHED = "One-time invites finished";
  const NEXT = (day: string) => `Thursday Crew: next session Saturday, October ${day}, 2026`;

  beforeEach(() => vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-project-token"));

  async function nightOn(
    groupId: Id<"groups">,
    date: string,
    state: "scheduled" | "cancelled" = "scheduled",
  ) {
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    return await seedSession(t, groupId, date, {
      state,
      published: {
        state,
        start: Date.UTC(year, month - 1, day, 17),
        end: Date.UTC(year, month - 1, day, 21),
        summary: "Thursday Crew",
        revision: 1,
      },
    });
  }

  async function resendSendsToday(count: number) {
    await t.run(async (ctx) => {
      await ctx.db.insert("mailVolume", { provider: "resend", day: "2026-10-07", count });
    });
  }

  async function startInvites() {
    await t.mutation(internal.oneTimeInvites.inviteScheduledSessions, {});
    await finish();
  }

  async function untilNextUtcMidnight() {
    await wait(Date.UTC(2026, 9, 8) - Date.now());
    await finish();
  }

  function subjectsTo(address: string) {
    return mailsTo(address).map(({ subject }) => subject);
  }

  it("invites the whole recipient set to every upcoming Session that fits the day's share, soonest first", async () => {
    const { groupId, gmEmail } = await crew();
    await nightOn(groupId, "2026-10-31");
    await nightOn(groupId, "2026-10-17");
    await nightOn(groupId, "2026-10-24");

    await startInvites();

    for (const address of [gmEmail, ROBIN])
      expect(subjectsTo(address)).toEqual([NEXT("17"), NEXT("24"), NEXT("31")]);
    expect(mailsTo(ROBIN)[0]!.text.split("\n")[0]).toBe(
      "The next session for Thursday Crew is set: Saturday, October 17, 2026, 19:00–23:00, Berlin time.",
    );
    expect(mailsTo(gmEmail)[0]!.text.split("\n")[0]).toBe(
      "You set the next session for Thursday Crew: Saturday, October 17, 2026, 19:00–23:00, Berlin time.",
    );
    expect(sequencesTo(ROBIN)).toEqual([1, 1, 1]);
    expect(logLines(FINISHED)).toEqual([{ sessions_invited: 3, invites_queued: 6 }]);
  });

  it("queues only what fits a day near its share, then finishes after the next UTC midnight", async () => {
    const { groupId } = await crew();
    for (const day of ["17", "24", "31"]) await nightOn(groupId, `2026-10-${day}`);
    await resendSendsToday(47);

    await startInvites();

    expect(subjectsTo(ROBIN)).toEqual([NEXT("17")]);
    expect(logLines(FINISHED)).toEqual([]);

    await untilNextUtcMidnight();

    expect(subjectsTo(ROBIN)).toEqual([NEXT("17"), NEXT("24"), NEXT("31")]);
    expect(
      resendRequests()
        .slice(2)
        .map(({ at }) => at >= Date.UTC(2026, 9, 8)),
    ).toEqual(Array(4).fill(true));
    expect(logLines(FINISHED)).toEqual([{ sessions_invited: 3, invites_queued: 6 }]);
  });

  it("skips a Session that had a Resend send, a cancelled Session and a past Session", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" });
    await finish();
    await nightOn(groupId, "2026-10-31", "cancelled");
    await nightOn(groupId, "2026-10-03");
    await nightOn(groupId, "2026-10-17");
    sent = [];

    await startInvites();

    expect(subjectsTo(ROBIN)).toEqual([NEXT("17")]);
  });

  it("still invites the GM and every Player to a night a newcomer was invited to first", async () => {
    const { groupId, gmEmail } = await crew();
    await nightOn(groupId, "2026-10-17");
    const kim = await signIn(t, { email: "kim@example.com" });
    await kim.as.mutation(api.player.join, { shareToken: "crew-token", name: "Kim" });
    await finish();
    expect(resendMails().flatMap(({ to }) => to)).toEqual(["kim@example.com"]);
    sent = [];

    await startInvites();

    expect(resendMails().flatMap(({ to }) => to)).toEqual([gmEmail, "kim@example.com", ROBIN]);
  });

  it("pages through Sessions whose recipients all turned Session mail off within Convex's limits", async () => {
    t = newBackend({ transactionLimits: true });
    for (let night = 0; night < 21; night++) {
      const { groupId } = await signedInGmWithGroup(t, (backend) =>
        signIn(backend, { email: `gm-${night}@example.com`, sessionEmailsEnabled: false }),
      );
      await t.run(async (ctx) => {
        for (let index = 0; index < 100; index++) {
          const userId = await ctx.db.insert("users", {
            email: `player-${night}-${index}@example.com`,
            sessionEmailsEnabled: false,
          });
          await ctx.db.insert("players", {
            groupId,
            name: `P${index}`,
            nameKey: `p${index}`,
            userId,
          });
        }
      });
      await nightOn(groupId, `2026-10-${10 + night}`);
    }

    await startInvites();

    expect(resendRequests()).toEqual([]);
    expect(logLines(FINISHED)).toEqual([{ sessions_invited: 0, invites_queued: 0 }]);
  });

  it("queues nothing on a second start after it finished", async () => {
    const { groupId } = await crew();
    await nightOn(groupId, "2026-10-17");
    await startInvites();
    sent = [];

    await startInvites();

    expect(resendRequests()).toEqual([]);
  });

  it("queues nothing without RESEND_API_KEY and leaves every Session for the start after the switch-on", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { groupId } = await crew();
    await nightOn(groupId, "2026-10-17");

    await startInvites();
    await untilNextUtcMidnight();

    expect(resendRequests()).toEqual([]);

    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    await startInvites();

    expect(subjectsTo(ROBIN)).toEqual([NEXT("17")]);
  });

  it("sends a Session larger than the day's share alone, on a day with no Resend sends yet", async () => {
    const big = await signedInGmWithGroup(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 59; index++) {
        const userId = await ctx.db.insert("users", { email: `player-${index}@example.com` });
        await ctx.db.insert("players", {
          groupId: big.groupId,
          name: `Player ${index}`,
          nameKey: `${index}`,
          userId,
        });
      }
    });
    const { groupId } = await crew();
    await nightOn(big.groupId, "2026-10-17");
    await nightOn(groupId, "2026-10-24");

    await startInvites();

    expect(resendRequests()).toHaveLength(60);
    expect(subjectsTo(ROBIN)).toEqual([]);

    await untilNextUtcMidnight();

    expect(subjectsTo(ROBIN)).toEqual([NEXT("24")]);
  });
});
