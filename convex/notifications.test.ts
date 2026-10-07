import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { newBackend, signedInGmWithGroup, signIn, type TestBackend } from "./model/test.setup";

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const date = "2026-10-17";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
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

async function finish() {
  for (let step = 0; step < 8; step++) {
    await vi.advanceTimersByTimeAsync(30_001);
    await t.finishInProgressScheduledFunctions();
  }
}

function bodies() {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init!.body as string) as Record<string, unknown>,
  );
}

it("returns to the GM before mail, then sends once to each current claimed Account except the actor", async () => {
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
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(30_000);
  await t.finishInProgressScheduledFunctions();
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

it("cancels a Session older than the Undo window and uses the current Group name and Share Link", async () => {
  const { as, groupId } = await crew();
  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  fetchMock.mockClear();
  await t.run(async (ctx) => {
    await ctx.db.patch("groups", groupId, { name: "Renamed Crew", shareToken: "new-token" });
  });
  await as.mutation(api.sessions.unschedule, { sessionId });
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

it.each([0, 30_000])(
  "Undo after %i ms sends neither schedule nor cancellation mail",
  async (elapsed) => {
    const { as, groupId } = await crew();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(elapsed);
    await as.mutation(api.sessions.unschedule, { sessionId });
    await finish();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

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

it("rechecks the preference before retrying a failed send", async () => {
  const { as, groupId, account } = await crew();
  fetchMock.mockImplementationOnce(async () => {
    await account.as.mutation(api.me.setSessionEmails, { enabled: false });
    return new Response(null, { status: 503 });
  });
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rejects signed-out and anonymous preference writes", async () => {
  const anonymous = await signIn(t, { isAnonymous: true });
  await expect(t.mutation(api.me.setSessionEmails, { enabled: false })).rejects.toThrow();
  await expect(
    anonymous.as.mutation(api.me.setSessionEmails, { enabled: false }),
  ).rejects.toThrow();
  expect(await t.query(api.me.sessionEmails, {})).toBeNull();
});

it("invalidates an older cancellation when the same night is scheduled and cancelled again", async () => {
  const { as, groupId } = await crew();
  const old = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  fetchMock.mockClear();
  await as.mutation(api.sessions.unschedule, { sessionId: old });
  const replacement = await as.mutation(api.sessions.schedule, { groupId, date });
  await as.mutation(api.sessions.unschedule, { sessionId: replacement });
  await finish();
  expect(fetchMock).not.toHaveBeenCalled();
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

it.each([1_000, 30_000])("Undo cancellation after %i ms sends no update", async (elapsed) => {
  const { as, groupId } = await crew();
  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  fetchMock.mockClear();
  await as.mutation(api.sessions.unschedule, { sessionId });
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(elapsed);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).not.toHaveBeenCalled();
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("scheduling again after Undo of an initial schedule still announces the final Session", async () => {
  const { as, groupId } = await crew();
  const sessionId = await as.mutation(api.sessions.schedule, { groupId, date });
  await as.mutation(api.sessions.unschedule, { sessionId });
  await as.mutation(api.sessions.schedule, { groupId, date });
  await finish();
  expect(bodies()).toEqual([expect.objectContaining({ change: "scheduled" })]);
});
