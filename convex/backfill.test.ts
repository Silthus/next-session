import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { BACKFILL_PAGE_SIZE } from "./backfill";
import {
  newBackend,
  seedSession,
  signedInGmWithGroup,
  signIn,
  type TestBackend,
} from "./model/test.setup";

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 12));
  vi.stubEnv("POSTHOG_SESSION_WEBHOOK_URL", "https://example.test/session");
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "secret");
  vi.stubEnv("SITE_URL", "https://next-session.link");
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function retiredTables(ctx: MutationCtx) {
  return ctx.db as unknown as GenericDatabaseWriter<GenericDataModel>;
}

async function seedMailStates(groupId: Id<"groups">, count: number) {
  await t.run(async (ctx) => {
    for (let row = 0; row < count; row++) {
      await retiredTables(ctx).insert("sessionMailStates", { groupId, date: "2026-10-17" });
    }
  });
}

async function mailStatesLeft() {
  return await t.run(
    async (ctx) => (await retiredTables(ctx).query("sessionMailStates").take(1)).length,
  );
}

async function sessions() {
  return await t.run(async (ctx) => await ctx.db.query("sessions").take(10 * BACKFILL_PAGE_SIZE));
}

async function backfill() {
  await t.mutation(internal.backfill.publishLegacySessions, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}

async function seedLegacySessions(groupId: Id<"groups">, count: number) {
  for (let day = 0; day < count; day++) {
    const date = new Date(Date.UTC(2026, 9, 17) + day * 86_400_000).toISOString().slice(0, 10);
    await seedSession(t, groupId, date);
  }
}

describe("backfill.publishLegacySessions", () => {
  it("publishes every legacy Session as scheduled at revision 0, page by page", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    await seedLegacySessions(groupId, BACKFILL_PAGE_SIZE + 1);

    await backfill();

    expect((await sessions()).map((session) => session.published)).toEqual(
      Array(BACKFILL_PAGE_SIZE + 1).fill({ state: "scheduled", revision: 0 }),
    );
  });

  it("empties the retired Session mail table, page by page", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    await seedMailStates(groupId, BACKFILL_PAGE_SIZE + 1);

    await backfill();

    expect(await mailStatesLeft()).toBe(0);
  });

  it("changes nothing on a second run", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    await seedLegacySessions(groupId, 3);
    await backfill();
    const once = await sessions();

    await backfill();

    expect(await sessions()).toEqual(once);
  });

  it("leaves a Session inside its first Undo window to announce itself", async () => {
    const { as, groupId } = await crew();
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    await backfill();

    expect(bodies()).toEqual([expect.objectContaining({ change: "scheduled" })]);
  });

  it("lets the first cancel of a legacy Session announce it", async () => {
    const { as, groupId } = await crew();
    const sessionId = await seedSession(t, groupId, "2026-10-17");
    await backfill();

    await as.mutation(api.sessions.cancel, { sessionId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(bodies()).toEqual([expect.objectContaining({ change: "cancelled" })]);
  });
});

describe("backfill.widenPublishedSnapshots", () => {
  const OCTOBER_17_AT_SEVEN = {
    start: Date.UTC(2026, 9, 17, 17),
    end: Date.UTC(2026, 9, 17, 21),
  };

  async function widen() {
    await t.mutation(internal.backfill.widenPublishedSnapshots, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  }

  async function publishedOf(sessionId: Id<"sessions">) {
    return await t.run(async (ctx) => (await ctx.db.get("sessions", sessionId))?.published);
  }

  async function groupNamed(name: string, fields: { location?: string } = {}) {
    const gm = await signedInGmWithGroup(t);
    await t.run(async (ctx) => await ctx.db.patch("groups", gm.groupId, { name, ...fields }));
    return gm;
  }

  it("fills the usual start, end and Group name into every published Session at the same revision, page by page", async () => {
    const { groupId } = await groupNamed("Thursday Crew");
    for (let page = 0; page <= BACKFILL_PAGE_SIZE; page++) {
      const date = new Date(Date.UTC(2026, 9, 17) + page * 86_400_000).toISOString().slice(0, 10);
      await seedSession(t, groupId, date, { published: { state: "scheduled", revision: 4 } });
    }

    await widen();

    const published = (await sessions()).map((session) => session.published);
    expect(published).toHaveLength(BACKFILL_PAGE_SIZE + 1);
    expect(published[0]).toEqual({
      state: "scheduled",
      ...OCTOBER_17_AT_SEVEN,
      summary: "Thursday Crew",
      revision: 4,
    });
    expect(published.at(-1)).toMatchObject({ summary: "Thursday Crew", revision: 4 });
  });

  it("widens with what was published before Time and place, so a Save before it still moves the Session", async () => {
    const { as, groupId } = await crew();
    const sessionId = await seedSession(t, groupId, "2026-10-17", {
      published: { state: "scheduled", revision: 1 },
    });
    await as.mutation(api.groups.updateSettings, {
      groupId,
      startTime: "18:30",
      lengthMinutes: 180,
      timeZone: "Europe/Berlin",
      location: "Max's place",
    });

    await t.mutation(internal.backfill.widenPublishedSnapshots, {});
    expect(await publishedOf(sessionId)).toEqual({
      state: "scheduled",
      ...OCTOBER_17_AT_SEVEN,
      summary: "My group",
      revision: 1,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(await publishedOf(sessionId)).toEqual({
      state: "scheduled",
      start: Date.UTC(2026, 9, 17, 16, 30),
      end: Date.UTC(2026, 9, 17, 19, 30),
      location: "Max's place",
      summary: "My group",
      revision: 2,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a settle that runs before it publish nothing for an unchanged Session", async () => {
    const { groupId } = await groupNamed("Thursday Crew");
    const changedAt = Date.now();
    const sessionId = await seedSession(t, groupId, "2026-10-17", {
      state: "scheduled",
      changedAt,
      published: { state: "scheduled", revision: 3 },
    });

    await t.mutation(internal.sessionLifecycle.settle, { sessionId, changedAt });

    expect(await publishedOf(sessionId)).toEqual({ state: "scheduled", revision: 3 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a Cancelled Session cancelled", async () => {
    const { groupId } = await groupNamed("Thursday Crew");
    const sessionId = await seedSession(t, groupId, "2026-10-17", {
      state: "cancelled",
      published: { state: "cancelled", revision: 2 },
    });

    await widen();

    expect(await publishedOf(sessionId)).toEqual({
      state: "cancelled",
      ...OCTOBER_17_AT_SEVEN,
      summary: "Thursday Crew",
      revision: 2,
    });
  });

  it("leaves a Session that was never published alone", async () => {
    const { groupId } = await groupNamed("Thursday Crew");
    const sessionId = await seedSession(t, groupId, "2026-10-17", {
      state: "scheduled",
      changedAt: Date.now(),
    });

    await widen();

    const session = await t.run(async (ctx) => await ctx.db.get("sessions", sessionId));
    expect(session).not.toHaveProperty("published");
  });

  it("changes nothing on a second run", async () => {
    const { groupId } = await groupNamed("Thursday Crew");
    await seedSession(t, groupId, "2026-10-17", { published: { state: "scheduled", revision: 1 } });
    await widen();
    await t.run(async (ctx) => await ctx.db.patch("groups", groupId, { name: "Renamed Crew" }));
    const once = await sessions();

    await widen();

    expect(await sessions()).toEqual(once);
  });

  it("lets the first settle after it publish nothing for an unchanged Session", async () => {
    const { as, groupId } = await crew();
    const sessionId = await seedSession(t, groupId, "2026-10-17", {
      published: { state: "scheduled", revision: 1 },
    });
    await widen();
    const widened = await publishedOf(sessionId);

    await as.mutation(api.groups.updateSettings, {
      groupId,
      startTime: "19:00",
      lengthMinutes: 240,
      timeZone: "Europe/Berlin",
      location: "",
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(await publishedOf(sessionId)).toEqual(widened);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function crew() {
  const gm = await signedInGmWithGroup(t);
  const account = await signIn(t, { email: "robin@example.com" });
  await t.run(async (ctx) => {
    await ctx.db.insert("players", {
      groupId: gm.groupId,
      name: "Robin",
      nameKey: "robin",
      userId: account.userId,
    });
  });
  return gm;
}

function bodies() {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init!.body as string) as Record<string, unknown>,
  );
}
