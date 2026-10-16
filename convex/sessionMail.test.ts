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
import { UNDO_WINDOW_MS } from "../shared/sessions";

type ResendMail = { to: string[]; subject: string; text: string };

const ROBIN = "robin@example.com";
const SEND_SPACING_MS = 1_000;
const CHANGE_ENDINGS = {
  cancelled: / cancelled$/,
  changed: / changed$/,
  withdrawn: / removed from your calendar$/,
};

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const date = "2026-10-17";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("SITE_URL", "http://localhost:5173");
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
  const account = await signIn(t, { email: ROBIN });
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", gm.groupId, { name: "Thursday Crew", shareToken: "old-token" });
    await ctx.db.insert("players", {
      groupId: gm.groupId,
      name: "Robin",
      nameKey: "robin",
      userId: account.userId,
    });
  });
  return { ...gm, account };
}

async function publishedSession() {
  const gm = await crew();
  const sessionId = await gm.as.mutation(api.sessions.schedule, { groupId: gm.groupId, date });
  await finish();
  fetchMock.mockClear();
  return { ...gm, sessionId };
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

async function deliver() {
  for (let hop = 0; hop < 8; hop++) await wait(SEND_SPACING_MS);
}

function mailsToRobin() {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse(init!.body as string) as ResendMail)
    .filter(({ to }) => to.includes(ROBIN));
}

function changes() {
  return mailsToRobin().map(({ subject }) => changeIn(subject));
}

function changeIn(subject: string) {
  const ending = Object.entries(CHANGE_ENDINGS).find(([, pattern]) => pattern.test(subject));
  return ending?.[0] ?? "set";
}

async function downloadedCalendar() {
  const response = await t.fetch("/cal/s/old-token.ics");
  expect(response.status).toBe(200);
  return await response.text();
}

async function feedStatusOf(as: GmClient, sessionId: Id<"sessions">) {
  const { url } = await as.mutation(api.me.calendarFeed, {});
  const response = await t.fetch(new URL(url).pathname);
  expect(response.status).toBe(200);
  const entry = (await response.text())
    .split("BEGIN:VEVENT")
    .find((event) => event.includes(`UID:${sessionId}@next-session.link`));
  return /STATUS:(\w+)/.exec(entry ?? "")?.[1];
}

async function sessionRow(sessionId: Id<"sessions">) {
  return await t.run(async (ctx) => await ctx.db.get("sessions", sessionId));
}

it("never announces a change before its Undo window ends", async () => {
  const { as, account, sessionId } = await publishedSession();

  await as.mutation(api.sessions.cancel, { sessionId });
  await wait(UNDO_WINDOW_MS);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await downloadedCalendar()).toContain(`UID:${sessionId}@next-session.link`);
  expect(await feedStatusOf(account.as, sessionId)).toBe("CONFIRMED");

  await wait(1);
  await deliver();
  expect(changes()).toEqual(["cancelled"]);
  expect(await downloadedCalendar()).not.toContain(`UID:${sessionId}@next-session.link`);
  expect(await feedStatusOf(account.as, sessionId)).toBe("CANCELLED");
});

describe("the Undo window", () => {
  it("removes a Session cancelled inside its first window and mails nobody", async () => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await wait(10_000);

    await as.mutation(api.sessions.cancel, { sessionId });
    await finish();

    expect(await sessionRow(sessionId)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a Session cancelled after its window as Cancelled and sends one cancelled mail", async () => {
    const { as, sessionId } = await publishedSession();

    await as.mutation(api.sessions.cancel, { sessionId });
    await finish();

    expect(await sessionRow(sessionId)).toMatchObject({ state: "cancelled" });
    expect(changes()).toEqual(["cancelled"]);
  });

  it("keeps the id on Undo of a cancel and mails nobody", async () => {
    const { as, groupId, sessionId } = await publishedSession();
    await as.mutation(api.sessions.cancel, { sessionId });
    await wait(1_000);

    expect(await as.mutation(api.sessions.schedule, { groupId, date })).toBe(sessionId);
    await finish();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores the same id on Schedule again and sends one set mail", async () => {
    const { as, groupId, sessionId } = await publishedSession();
    await as.mutation(api.sessions.cancel, { sessionId });
    await finish();
    fetchMock.mockClear();

    expect(await as.mutation(api.sessions.schedule, { groupId, date })).toBe(sessionId);
    await finish();

    expect(await sessionRow(sessionId)).toMatchObject({ state: "scheduled" });
    expect(changes()).toEqual(["set"]);
  });

  it("sends exactly one cancelled mail for cancel, Schedule again and cancel inside one window", async () => {
    const { as, groupId, sessionId } = await publishedSession();

    await as.mutation(api.sessions.cancel, { sessionId });
    await as.mutation(api.sessions.schedule, { groupId, date });
    await as.mutation(api.sessions.cancel, { sessionId });
    await finish();

    expect(changes()).toEqual(["cancelled"]);
  });

  it("publishes a burst of changes once, a window after the last", async () => {
    const { as, groupId, sessionId } = await publishedSession();

    await as.mutation(api.sessions.cancel, { sessionId });
    for (let change = 0; change < 2; change++) {
      await wait(20_000);
      await as.mutation(api.sessions.schedule, { groupId, date });
      await wait(20_000);
      await as.mutation(api.sessions.cancel, { sessionId });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await finish();

    expect(changes()).toEqual(["cancelled"]);
  });

  it("announces the final Session after a new one is undone and scheduled again", async () => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await as.mutation(api.sessions.cancel, { sessionId });
    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();

    expect(changes()).toEqual(["set"]);
  });

  it.each([0, UNDO_WINDOW_MS])(
    "sends nothing for a new Session undone after %i ms",
    async (elapsed) => {
      const { as, groupId } = await crew();
      const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
      await wait(elapsed);

      await as.mutation(api.sessions.cancel, { sessionId });
      await finish();

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([1_000, UNDO_WINDOW_MS])(
    "sends nothing for a cancel undone after %i ms",
    async (elapsed) => {
      const { as, groupId, sessionId } = await publishedSession();
      await as.mutation(api.sessions.cancel, { sessionId });
      await wait(elapsed);

      await as.mutation(api.sessions.schedule, { groupId, date });
      await finish();

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not move a pending settle when a Cancelled Session is cancelled again", async () => {
    const { as, sessionId } = await publishedSession();
    await as.mutation(api.sessions.cancel, { sessionId });
    await wait(20_000);

    await as.mutation(api.sessions.cancel, { sessionId });
    await wait(10_001);
    await deliver();

    expect(changes()).toEqual(["cancelled"]);
  });
});

it("cancels with the current Group name and Share Link", async () => {
  const { as, groupId, sessionId } = await publishedSession();
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", groupId, { name: "Renamed Crew", shareToken: "new-token" });
  });

  await as.mutation(api.sessions.cancel, { sessionId });
  await finish();

  const [mail, ...more] = mailsToRobin();
  expect(more).toEqual([]);
  expect(mail!.subject).toBe("Renamed Crew: session on Saturday, October 17, 2026 cancelled");
  expect(mail!.text).toContain("http://localhost:5173/s/new-token");
});

it("lets an Account turn session emails off and back on, with email on by default", async () => {
  const { account, as, groupId } = await crew();
  const sessionEmails = async () =>
    (await account.as.query(api.me.notificationSettings, {}))?.sessionEmails;
  expect(await sessionEmails()).toBe(true);
  await account.as.mutation(api.me.setSessionEmails, { enabled: false });
  expect(await sessionEmails()).toBe(false);
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  expect(mailsToRobin()).toEqual([]);
  await account.as.mutation(api.me.setSessionEmails, { enabled: true });
  await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-18" });
  await finish();
  expect(changes()).toEqual(["set"]);
});

it.each(["release", "remove-group", "test-email", "anonymous"])(
  "rechecks %s before delivery",
  async (change) => {
    const { as, groupId, account } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date });
    await t.run(async (ctx) => {
      if (change === "remove-group") await ctx.db.delete("groups", groupId);
      if (change === "release") {
        const player = await ctx.db
          .query("players")
          .withIndex("by_userId_and_groupId", (q) => q.eq("userId", account.userId))
          .first();
        await ctx.db.patch("players", player!._id, { userId: undefined });
      }
      if (change === "test-email")
        await ctx.db.patch("users", account.userId, { email: "Robin@EXAMPLE.TEST" });
      if (change === "anonymous")
        await ctx.db.patch("users", account.userId, { isAnonymous: true });
    });
    await finish();
    expect(mailsToRobin()).toEqual([]);
  },
);

it.each(["release", "opt-out", "remove-group"])(
  "rechecks %s before retrying a failed send",
  async (change) => {
    const { as, groupId, account } = await crew();
    let robinFailed = false;
    fetchMock.mockImplementation(async (_url, init) => {
      if (robinFailed || !(init!.body as string).includes(ROBIN))
        return new Response(null, { status: 200 });
      robinFailed = true;
      if (change === "release") await account.as.mutation(api.player.release, { groupId });
      if (change === "opt-out")
        await account.as.mutation(api.me.setSessionEmails, { enabled: false });
      if (change === "remove-group") await as.mutation(api.groups.remove, { groupId });
      return new Response(null, { status: 503 });
    });
    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();
    expect(changes().filter((sent) => sent === "set")).toHaveLength(1);
  },
);

it("rejects signed-out and anonymous preference writes", async () => {
  const anonymous = await signIn(t, { isAnonymous: true });
  await expect(t.mutation(api.me.setSessionEmails, { enabled: false })).rejects.toThrow();
  await expect(
    anonymous.as.mutation(api.me.setSessionEmails, { enabled: false }),
  ).rejects.toThrow();
  expect(await t.query(api.me.notificationSettings, {})).toBeNull();
});
