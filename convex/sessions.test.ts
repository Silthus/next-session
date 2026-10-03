import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectErrorCode,
  newBackend,
  signInAccount,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 23, 30);
const TODAY = "2026-10-03";
const LAST_BOOKABLE_DATE = "2026-12-31";

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function signedInGmWithGroup(signInGm = signInAccount) {
  const gm = await signInGm(t);
  const groupId = await gm.as.mutation(api.groups.create, {});
  return { ...gm, groupId };
}

async function sessionDatesOf(groupId: Id<"groups">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("sessions")
        .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
        .collect()
    ).map((session) => session.date),
  );
}

async function seedSession(groupId: Id<"groups">, scheduledBy: Id<"users">, date: string) {
  return await t.run(
    async (ctx) => await ctx.db.insert("sessions", { groupId, date, scheduledBy }),
  );
}

async function expiryOf(groupId: Id<"groups">) {
  return await t.run(async (ctx) => (await ctx.db.get("groups", groupId))?.expiresAt);
}

describe("sessions.schedule", () => {
  it("records the Session and who scheduled it", async () => {
    const { as, groupId, userId } = await signedInGmWithGroup();

    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    const session = await t.run(async (ctx) => await ctx.db.get("sessions", sessionId));
    expect(session).toMatchObject({ groupId, date: "2026-10-17", scheduledBy: userId });
  });

  it.each([TODAY, LAST_BOOKABLE_DATE])(
    "accepts %s at the edge of the Booking Window",
    async (date) => {
      const { as, groupId } = await signedInGmWithGroup();

      await as.mutation(api.sessions.schedule, { groupId, date });

      expect(await sessionDatesOf(groupId)).toEqual([date]);
    },
  );

  it.each(["2026-10-02", "2027-01-01", "2026-02-30", "2026-10-3", "tomorrow"])(
    "rejects %s outside the Booking Window",
    async (date) => {
      const { as, groupId } = await signedInGmWithGroup();

      await expectErrorCode(as.mutation(api.sessions.schedule, { groupId, date }), "OUT_OF_WINDOW");
      expect(await sessionDatesOf(groupId)).toEqual([]);
    },
  );

  it("allows one Session per date", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    await expectErrorCode(
      as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" }),
      "SESSION_EXISTS",
    );
    expect(await sessionDatesOf(groupId)).toEqual(["2026-10-17"]);
  });

  it("lets two Groups play on the same date", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const otherGroupId = await as.mutation(api.groups.create, {});
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    await as.mutation(api.sessions.schedule, { groupId: otherGroupId, date: "2026-10-17" });

    expect(await sessionDatesOf(otherGroupId)).toEqual(["2026-10-17"]);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(signInAnonymousGm);
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    expect(await expiryOf(groupId)).toBe(NOW + 32 * DAY);
  });

  it("treats a foreign Group as missing", async () => {
    const { as } = await signedInGmWithGroup();
    const stranger = await signedInGmWithGroup();

    await expectErrorCode(
      as.mutation(api.sessions.schedule, { groupId: stranger.groupId, date: "2026-10-17" }),
      "NOT_FOUND",
    );
    expect(await sessionDatesOf(stranger.groupId)).toEqual([]);
  });

  it("rejects a signed-out caller", async () => {
    const { groupId } = await signedInGmWithGroup();

    await expectErrorCode(
      t.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" }),
      "UNAUTHENTICATED",
    );
  });
});

describe("sessions.unschedule", () => {
  it("deletes the Session", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" });

    await as.mutation(api.sessions.unschedule, { sessionId });

    expect(await sessionDatesOf(groupId)).toEqual(["2026-10-24"]);
  });

  it("frees the date for a new Session", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    await as.mutation(api.sessions.unschedule, { sessionId });

    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    expect(await sessionDatesOf(groupId)).toEqual(["2026-10-17"]);
  });

  it("unschedules a Session today", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: TODAY });

    await as.mutation(api.sessions.unschedule, { sessionId });

    expect(await sessionDatesOf(groupId)).toEqual([]);
  });

  it("keeps a past Session, because past dates are read-only", async () => {
    const { as, groupId, userId } = await signedInGmWithGroup();
    const sessionId = await seedSession(groupId, userId, "2026-10-02");

    await expectErrorCode(as.mutation(api.sessions.unschedule, { sessionId }), "OUT_OF_WINDOW");
    expect(await sessionDatesOf(groupId)).toEqual(["2026-10-02"]);
  });

  it("pushes out the Expiry of an Unsaved Group", async () => {
    const { as, groupId } = await signedInGmWithGroup(signInAnonymousGm);
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    vi.setSystemTime(NOW + 2 * DAY);

    await as.mutation(api.sessions.unschedule, { sessionId });

    expect(await expiryOf(groupId)).toBe(NOW + 32 * DAY);
  });

  it("treats a Session of a foreign Group as missing", async () => {
    const { as } = await signedInGmWithGroup();
    const stranger = await signedInGmWithGroup();
    const sessionId = await stranger.as.mutation(api.sessions.schedule, {
      groupId: stranger.groupId,
      date: "2026-10-17",
    });

    await expectErrorCode(as.mutation(api.sessions.unschedule, { sessionId }), "NOT_FOUND");
    expect(await sessionDatesOf(stranger.groupId)).toEqual(["2026-10-17"]);
  });

  it("treats an already unscheduled Session as missing", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
    await as.mutation(api.sessions.unschedule, { sessionId });

    await expectErrorCode(as.mutation(api.sessions.unschedule, { sessionId }), "NOT_FOUND");
  });

  it("rejects a signed-out caller", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    await expectErrorCode(t.mutation(api.sessions.unschedule, { sessionId }), "UNAUTHENTICATED");
  });
});
