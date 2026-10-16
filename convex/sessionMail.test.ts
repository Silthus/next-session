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

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const date = "2026-10-17";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("POSTHOG_SESSION_WEBHOOK_URL", "https://example.test/session");
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "secret");
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
  const account = await signIn(t, { email: "robin@example.com" });
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
  for (let hop = 0; hop < 8; hop++) await wait(1);
}

function bodies() {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init!.body as string) as Record<string, unknown>,
  );
}

function changes() {
  return bodies().map(({ change }) => change);
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

it("returns to the GM before mail, then sends once to each current claimed Account but never the Group's owner", async () => {
  const { as, groupId, userId, account } = await crew();
  await t.run(async (ctx) => {
    await ctx.db.insert("players", {
      groupId,
      name: "Duplicate",
      nameKey: "duplicate",
      userId: account.userId,
    });
    await ctx.db.insert("players", { groupId, name: "GM", nameKey: "gm", userId });
    await ctx.db.insert("players", { groupId, name: "Visitor", nameKey: "visitor" });
  });
  await as.mutation(api.sessions.schedule, { groupId, date });
  expect(fetchMock).not.toHaveBeenCalled();
  await wait(UNDO_WINDOW_MS);
  expect(fetchMock).not.toHaveBeenCalled();
  await finish();
  expect(bodies()).toEqual([
    {
      distinct_id: `next-session:${account.userId}`,
      product: "next-session",
      email: "robin@example.com",
      group_name: "Thursday Crew",
      date_label: "Saturday, October 17, 2026",
      change: "scheduled",
      player_url: "https://next-session.link/s/old-token",
    },
  ]);
  expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).get("Authorization")).toBe(
    "Bearer secret",
  );
});

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

  it("keeps a Session cancelled after its window as Cancelled and sends one cancelled update", async () => {
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

  it("restores the same id on Schedule again and sends one scheduled update", async () => {
    const { as, groupId, sessionId } = await publishedSession();
    await as.mutation(api.sessions.cancel, { sessionId });
    await finish();
    fetchMock.mockClear();

    expect(await as.mutation(api.sessions.schedule, { groupId, date })).toBe(sessionId);
    await finish();

    expect(await sessionRow(sessionId)).toMatchObject({ state: "scheduled" });
    expect(changes()).toEqual(["scheduled"]);
  });

  it("sends exactly one cancelled update for cancel, Schedule again and cancel inside one window", async () => {
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

    expect(changes()).toEqual(["scheduled"]);
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

it("sends no Session update when a saved Time and place moves a Session", async () => {
  const { as, groupId, sessionId } = await publishedSession();

  await as.mutation(api.groups.updateSettings, {
    groupId,
    startTime: "20:00",
    lengthMinutes: 180,
    timeZone: "Europe/Berlin",
    location: "Max's place",
  });
  await finish();

  expect((await sessionRow(sessionId))?.published?.revision).toBe(2);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("cancels with the current Group name and Share Link", async () => {
  const { as, groupId, sessionId } = await publishedSession();
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", groupId, { name: "Renamed Crew", shareToken: "new-token" });
  });

  await as.mutation(api.sessions.cancel, { sessionId });
  await finish();

  expect(bodies()).toEqual([
    expect.objectContaining({
      change: "cancelled",
      group_name: "Renamed Crew",
      player_url: "https://next-session.link/s/new-token",
    }),
  ]);
});

it("lets an Account turn session emails off and back on, with email on by default", async () => {
  const { account, as, groupId } = await crew();
  expect(await account.as.query(api.me.sessionEmails, {})).toBe(true);
  await account.as.mutation(api.me.setSessionEmails, { enabled: false });
  expect(await account.as.query(api.me.sessionEmails, {})).toBe(false);
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  expect(fetchMock).not.toHaveBeenCalled();
  await account.as.mutation(api.me.setSessionEmails, { enabled: true });
  await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-18" });
  await finish();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["POSTHOG_SESSION_WEBHOOK_URL", "POSTHOG_MAIL_WEBHOOK_SECRET"])(
  "sends nothing without %s",
  async (variable) => {
    const { as, groupId } = await crew();
    vi.stubEnv(variable, "");
    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it("publishes without mail configured and queues no send", async () => {
  const { as, groupId } = await crew();
  vi.stubEnv("POSTHOG_SESSION_WEBHOOK_URL", "");

  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  expect(await sessionRow(sessionId)).toMatchObject({
    published: { state: "scheduled", revision: 1 },
  });
  expect(await t.run(async (ctx) => await ctx.db.query("mailVolume").first())).toBeNull();
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
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it.each(["release", "opt-out", "remove-group"])(
  "rechecks %s before retrying a failed send",
  async (change) => {
    const { as, groupId, account } = await crew();
    fetchMock.mockImplementationOnce(async () => {
      if (change === "release") await account.as.mutation(api.player.release, { groupId });
      if (change === "opt-out")
        await account.as.mutation(api.me.setSessionEmails, { enabled: false });
      if (change === "remove-group") await as.mutation(api.groups.remove, { groupId });
      return new Response(null, { status: 503 });
    });
    await as.mutation(api.sessions.schedule, { groupId, date });
    await finish();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it("drops a retry once the Session's published state has changed", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { as, groupId, sessionId } = await publishedSession();
  fetchMock.mockImplementation((_url, init) =>
    Promise.resolve(
      new Response(null, { status: (init!.body as string).includes("cancelled") ? 503 : 200 }),
    ),
  );
  await as.mutation(api.sessions.cancel, { sessionId });
  await wait(UNDO_WINDOW_MS + 1);
  await deliver();
  expect(changes()).toEqual(["cancelled"]);

  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();

  expect(changes()).toEqual(["cancelled", "cancelled", "scheduled"]);
});

it("keeps retrying an update across a time-only change of the same Session", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { as, groupId } = await crew();
  let webhookDown = true;
  const delivered: unknown[] = [];
  fetchMock.mockImplementation((_url, init) => {
    if (webhookDown) return Promise.resolve(new Response(null, { status: 503 }));
    delivered.push((JSON.parse(init!.body as string) as { change: string }).change);
    return Promise.resolve(new Response(null, { status: 200 }));
  });
  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await wait(UNDO_WINDOW_MS + 1);
  await deliver();

  await as.mutation(api.sessions.updateDetails, { sessionId, startTime: "20:00" });
  await wait(UNDO_WINDOW_MS + 1);
  expect((await sessionRow(sessionId))?.published?.revision).toBe(2);
  webhookDown = false;
  await finish();

  expect(delivered).toEqual(["scheduled"]);
});

it.each([
  [503, 2],
  [400, 1],
  [429, 1],
])("HTTP %i produces %i attempts", async (status, attempts) => {
  const { as, groupId } = await crew();
  fetchMock.mockResolvedValueOnce(new Response(null, { status }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  expect(fetchMock).toHaveBeenCalledTimes(attempts);
});

it("rejects signed-out and anonymous preference writes", async () => {
  const anonymous = await signIn(t, { isAnonymous: true });
  await expect(t.mutation(api.me.setSessionEmails, { enabled: false })).rejects.toThrow();
  await expect(
    anonymous.as.mutation(api.me.setSessionEmails, { enabled: false }),
  ).rejects.toThrow();
  expect(await t.query(api.me.sessionEmails, {})).toBeNull();
});

it("warns as daily estimated mail reaches 80 and exceeds 100 across different Groups without dropping a recipient", async () => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-project-token");
  const logs: Record<string, unknown>[] = [];
  fetchMock.mockImplementation((url, init) => {
    if (
      (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).includes(
        "/i/v1/logs",
      )
    )
      logs.push(JSON.parse(init!.body as string) as Record<string, unknown>);
    return Promise.resolve(new Response(null, { status: 200 }));
  });
  for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
    const { as, groupId } = await signedInGmWithGroup(t);
    await t.run(async (ctx) => {
      for (let playerIndex = 0; playerIndex < 51; playerIndex++) {
        const userId = await ctx.db.insert("users", {
          email: `player-${groupIndex}-${playerIndex}@example.com`,
        });
        await ctx.db.insert("players", {
          groupId,
          name: `Player ${playerIndex}`,
          nameKey: `${playerIndex}`,
          userId,
        });
      }
    });
    await as.mutation(api.sessions.schedule, { groupId, date });
  }
  await finish();
  expect(
    fetchMock.mock.calls.filter(([url]) => url === "https://example.test/session"),
  ).toHaveLength(102);
  expect(JSON.stringify(logs)).toContain("Session mail daily volume warning");
  expect(JSON.stringify(logs)).toContain("80");
  expect(JSON.stringify(logs)).toContain("101");
  expect(JSON.stringify(logs)).not.toContain("@example.com");
});
