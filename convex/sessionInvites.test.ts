import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { requestMail } from "./mail";
import {
  newBackend,
  signedInGmWithGroup,
  signIn,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";
import { UNDO_WINDOW_MS } from "./sessionLifecycle";

const RESEND_URL = "https://api.resend.com/emails";
const WORKFLOWS_SESSION_URL = "https://example.test/session";
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
  vi.stubEnv("POSTHOG_SESSION_WEBHOOK_URL", WORKFLOWS_SESSION_URL);
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

function mailTo(address: string) {
  const mails = resendMails().filter(({ to }) => to.includes(address));
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
  const { as, groupId, gmEmail } = await crew();
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
  fetchMock.mockImplementation(async (_url, init) => {
    if (!(init!.body as string).includes("kim@example.com"))
      return new Response(null, { status: 200 });
    await kim.as.mutation(api.player.release, { groupId });
    return new Response(null, { status: 503 });
  });

  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  expect(
    resendMails()
      .flatMap(({ to }) => to)
      .sort(),
  ).toEqual([gmEmail, "kim@example.com", "robin@example.com"].sort());
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

describe("delivery", () => {
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

    expect(resendRequests().map(({ headers }) => headers.get("Idempotency-Key"))).toEqual([
      `calendar/${sessionId}@next-session.link/1/${userId}`,
      `calendar/${sessionId}@next-session.link/1/${userId}`,
    ]);
    const [first, retry] = resendRequests();
    expect(retry!.at).toBeGreaterThan(first!.at);
    expect(retry!.body).toBe(first!.body);
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

describe("the provider switch", () => {
  it("leaves Session updates on Workflows and Resend untouched without RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { as, groupId } = await crew();

    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(sent.map(({ url }) => url)).toEqual([WORKFLOWS_SESSION_URL]);
  });

  it("requests no Workflows Session update while RESEND_API_KEY is set", async () => {
    const { as, groupId } = await crew();

    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(sent.map(({ url }) => url)).toEqual([RESEND_URL, RESEND_URL]);
  });
});

describe("mail volume", () => {
  beforeEach(() => vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-project-token"));

  function volumeWarnings() {
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
      .filter((record) => record.body.stringValue === "Daily mail volume warning")
      .map(({ attributes }) =>
        Object.fromEntries(attributes.map(({ key, value }) => [key, Object.values(value)[0]])),
      );
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
