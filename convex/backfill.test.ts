import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { LEGACY_PAGE_SIZE } from "./backfill";
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
  return await t.run(async (ctx) => await ctx.db.query("sessions").take(10 * LEGACY_PAGE_SIZE));
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
    await seedLegacySessions(groupId, LEGACY_PAGE_SIZE + 1);

    await backfill();

    expect((await sessions()).map((session) => session.published)).toEqual(
      Array(LEGACY_PAGE_SIZE + 1).fill({ state: "scheduled", revision: 0 }),
    );
  });

  it("empties the retired Session mail table, page by page", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    await seedMailStates(groupId, LEGACY_PAGE_SIZE + 1);

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
