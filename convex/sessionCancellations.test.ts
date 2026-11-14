import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signIn,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";
import { UNDO_WINDOW_MS } from "../shared/sessions";
import {
  accepted,
  POSTHOG_SEND_URL as SEND_URL,
  postHogEmailFake,
  urlOf,
  type SentEmail,
} from "../posthogEmailFake";

const ROBIN = "robin@example.com";

type SentRequest = { url: string; at: number; body: string };

let t: TestBackend;
let sent: SentRequest[];
let email: ReturnType<typeof postHogEmailFake>;

// Answers every request as given, after keeping it in `sent`.
function answering(answer: (url: string, body: string) => Response) {
  email = postHogEmailFake((input, init) => {
    const url = urlOf(input);
    const body = init?.body as string;
    sent.push({ url, at: Date.now(), body });
    return Promise.resolve(answer(url, body));
  });
  vi.stubGlobal("fetch", email.fetch);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test_project");
  vi.stubEnv("POSTHOG_SECRET_KEY", "phs_test_key");
  vi.stubEnv("SITE_URL", "https://next-session.link");
  sent = [];
  answering(() => accepted());
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function crew(signInGm?: Parameters<typeof signedInGmWithGroup>[1]) {
  const gm = await signedInGmWithGroup(t, signInGm);
  const robin = await signIn(t, { email: ROBIN });
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", gm.groupId, { name: "Thursday Crew", shareToken: "crew-token" });
    await ctx.db.insert("players", {
      groupId: gm.groupId,
      name: "Robin",
      nameKey: "robin",
      userId: robin.userId,
    });
  });
  const gmEmail = await t.run(async (ctx) => (await ctx.db.get("users", gm.userId))!.email);
  return { ...gm, gmEmail, robin };
}

type Crew = Awaited<ReturnType<typeof crew>>;

async function scheduleNights({ as, groupId }: Crew, dates = ["2026-10-17", "2026-10-24"]) {
  for (const date of dates) await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
}

async function scheduleNightIds({ as, groupId }: Crew, dates: string[]) {
  const ids = [];
  for (const date of dates) ids.push(await as.mutation(api.sessions.schedule, { groupId, date }));
  await finish();
  return ids;
}

async function finish() {
  for (let step = 0; step < 8; step++) {
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function cancellationsKept() {
  return await t.run(async (ctx) => await ctx.db.query("calendarCancellations").collect());
}

function sentMails() {
  return sent
    .filter(({ url }) => url === SEND_URL)
    .map(({ body }) => JSON.parse(body) as SentEmail);
}

function mailsTo(address: string) {
  return sentMails().filter(({ to }) => to === address);
}

function calendarOf(mail: SentEmail) {
  return email.fileText(mail.attachments![0]!).replace(/\r\n /g, "");
}

function sequenceOf(mail: SentEmail) {
  return Number(/SEQUENCE:(\d+)/.exec(calendarOf(mail))![1]);
}

function uidOf(mail: SentEmail) {
  return /UID:(.+)\r\n/.exec(calendarOf(mail))![1]!;
}

function lastSequenceByUid(mails: SentEmail[]) {
  return new Map(mails.map((mail) => [uidOf(mail), sequenceOf(mail)]));
}

describe("deleting a Group", () => {
  it("cancels every upcoming published Session in each calendar it reached before the Group goes", async () => {
    const gm = await crew();
    const { as, groupId } = gm;
    const gmEmail = gm.gmEmail!;
    await scheduleNights(gm);
    const invited = {
      gm: lastSequenceByUid(mailsTo(gmEmail)),
      robin: lastSequenceByUid(mailsTo(ROBIN)),
    };
    sent = [];

    await as.mutation(api.groups.remove, { groupId });
    await finish();

    expect(mailsTo(ROBIN).map(({ subject, text }) => [subject, text!.split("\n")[0]])).toEqual([
      [
        "Thursday Crew: session on Saturday, October 17, 2026 cancelled",
        "Thursday Crew was deleted, so its session on Saturday, October 17, 2026 is off.",
      ],
      [
        "Thursday Crew: session on Saturday, October 24, 2026 cancelled",
        "Thursday Crew was deleted, so its session on Saturday, October 24, 2026 is off.",
      ],
    ]);
    expect(mailsTo(gmEmail).map(({ text }) => text!.split("\n")[0])).toEqual([
      "You deleted Thursday Crew, so its session on Saturday, October 17, 2026 is off.",
      "You deleted Thursday Crew, so its session on Saturday, October 24, 2026 is off.",
    ]);
    expect(sentMails()).toHaveLength(4);
    for (const [address, lastInvite] of [
      [ROBIN, invited.robin],
      [gmEmail, invited.gm],
    ] as const) {
      for (const mail of mailsTo(address)) {
        expect(mail.attachments![0]!.content_type).toBe(
          "text/calendar; charset=utf-8; method=CANCEL",
        );
        expect(calendarOf(mail)).toContain("METHOD:CANCEL\r\n");
        expect(calendarOf(mail)).toContain("STATUS:CANCELLED\r\n");
        expect(sequenceOf(mail)).toBeGreaterThan(lastInvite.get(uidOf(mail))!);
      }
    }
  });

  it("cancels a night whose cancel was published but had not reached the calendars yet", async () => {
    const gm = await crew();
    const { as, groupId } = gm;
    const [sessionId] = await scheduleNightIds(gm, ["2026-10-17"]);
    answering((url, body) =>
      url === SEND_URL && body.includes("cancelled")
        ? new Response(null, { status: 503 })
        : accepted(),
    );
    await as.mutation(api.sessions.cancel, { sessionId: sessionId! });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1);
    await t.finishInProgressScheduledFunctions();
    answering(() => accepted());
    sent = [];

    await as.mutation(api.groups.remove, { groupId });
    await finish();

    expect(mailsTo(ROBIN).map(({ text }) => text!.split("\n")[0])).toEqual([
      "Thursday Crew was deleted, so its session on Saturday, October 17, 2026 is off.",
    ]);
  });

  it("cancels nothing that is past or was never published", async () => {
    const { as, groupId } = await crew();
    await seedSession(t, groupId, "2026-10-01", {
      published: {
        state: "scheduled",
        start: Date.UTC(2026, 9, 1, 17),
        end: Date.UTC(2026, 9, 1, 21),
        summary: "Thursday Crew",
        revision: 1,
      },
    });
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" });
    sent = [];

    await as.mutation(api.groups.remove, { groupId });
    await finish();

    expect(sentMails()).toEqual([]);
  });

  it("cancels an expired Unsaved Group's nights for its Players and leaves its Anonymous GM out", async () => {
    const anonymous = await crew(signInAnonymousGm);
    const { groupId } = anonymous;
    await scheduleNights(anonymous);
    sent = [];
    await t.run(async (ctx) => ctx.db.patch("groups", groupId, { expiresAt: Date.now() - 1 }));

    await t.mutation(internal.cleanup.sweepExpiredGroups, {});
    await finish();

    expect(sentMails().map(({ to, text }) => [to, text!.split("\n")[0]])).toEqual([
      [ROBIN, "Thursday Crew was deleted, so its session on Saturday, October 17, 2026 is off."],
      [ROBIN, "Thursday Crew was deleted, so its session on Saturday, October 24, 2026 is off."],
    ]);
  });

  it("drains 100 Accounts × 20 Sessions in runs Convex accepts, spaced 500 ms apart, and forgets them", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    t = newBackend({ transactionLimits: true });
    const { as, groupId } = await signedInGmWithGroup(t);
    const nights = Array.from({ length: 20 }, (_, week) => {
      const start = Date.UTC(2026, 9, 10 + 3 * week, 17);
      return { date: new Date(start).toISOString().slice(0, 10), start };
    });
    await t.run(async (ctx) => {
      for (let index = 1; index < 100; index++) {
        const userId = await ctx.db.insert("users", { email: `player-${index}@example.com` });
        await ctx.db.insert("players", {
          groupId,
          name: `P${index}`,
          nameKey: `p${index}`,
          userId,
        });
      }
      for (const { date, start } of nights) {
        await ctx.db.insert("sessions", {
          groupId,
          date,
          published: {
            state: "scheduled",
            start,
            end: start + 4 * 3_600_000,
            summary: "Big Table",
            revision: 1,
          },
        });
      }
    });

    await as.mutation(api.groups.remove, { groupId });
    for (let minute = 0; minute < 25; minute++) {
      await vi.advanceTimersByTimeAsync(60_000);
      await t.finishInProgressScheduledFunctions();
    }

    const mails = sentMails();
    expect(mails).toHaveLength(2_000);
    expect(new Set(mails.map(({ to }) => to)).size).toBe(100);
    expect(new Set(mails.map((mail) => `${mail.to} ${uidOf(mail)}`)).size).toBe(2_000);
    const times = sent.filter(({ url }) => url === SEND_URL).map(({ at }) => at);
    const gaps = times.slice(1).map((at, index) => at - times[index]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(500);
    expect(await cancellationsKept()).toEqual([]);
  }, 30_000);

  it("drops a deletion cancel once the Account turns Session mail off before it sends", async () => {
    const gm = await crew();
    await scheduleNights(gm);
    sent = [];

    await gm.as.mutation(api.groups.remove, { groupId: gm.groupId });
    await gm.robin.as.mutation(api.me.setSessionEmails, { enabled: false });
    await finish();

    expect(mailsTo(ROBIN)).toEqual([]);
    expect(mailsTo(gm.gmEmail!)).toHaveLength(2);
  });

  it("deletes as before without PostHog's secret key: nothing kept for later, nothing sent", async () => {
    const gm = await crew();
    await scheduleNights(gm);
    vi.stubEnv("POSTHOG_SECRET_KEY", "");
    sent = [];

    await gm.as.mutation(api.groups.remove, { groupId: gm.groupId });
    const keptForLater = await cancellationsKept();
    await finish();

    expect(keptForLater).toEqual([]);
    expect(sentMails()).toEqual([]);
    expect(await gm.as.query(api.groups.get, { groupId: gm.groupId })).toBeNull();
  });
});
