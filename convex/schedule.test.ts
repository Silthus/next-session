import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeMonth } from "../shared/monthSummary";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newBackend, signInAccount, type TestBackend } from "./model/test.setup";

const NOW = Date.UTC(2026, 9, 3, 12);
const TODAY = "2026-10-03";

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function signedInGmWithGroup() {
  const gm = await signInAccount(t);
  const groupId = await gm.as.mutation(api.groups.create, {});
  return { ...gm, groupId };
}

type Answer = "free" | "maybe" | "busy";

async function seedAnswers(
  groupId: Id<"groups">,
  playerId: Id<"players">,
  answers: Record<string, Answer>,
) {
  await t.run(async (ctx) => {
    for (const [date, answer] of Object.entries(answers)) {
      await ctx.db.insert("answers", { groupId, playerId, date, answer });
    }
  });
}

async function seedSession(groupId: Id<"groups">, scheduledBy: Id<"users">, date: string) {
  return await t.run(
    async (ctx) => await ctx.db.insert("sessions", { groupId, date, scheduledBy }),
  );
}

describe("schedule.month", () => {
  it("returns the Roster, the month's Answers, and every Session of the Group", async () => {
    const { as, groupId, userId } = await signedInGmWithGroup();
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    const grace = await as.mutation(api.roster.addPlayer, { groupId, name: "Grace" });
    await seedAnswers(groupId, ada, {
      "2026-09-30": "free",
      "2026-10-01": "free",
      "2026-10-31": "maybe",
      "2026-11-01": "busy",
    });
    await seedAnswers(groupId, grace, { "2026-10-17": "busy" });
    const september = await seedSession(groupId, userId, "2026-09-12");
    const october = await seedSession(groupId, userId, "2026-10-17");
    const december = await seedSession(groupId, userId, "2026-12-05");

    const schedule = await as.query(api.schedule.month, { groupId, month: "2026-10" });

    expect(schedule).toEqual({
      players: [
        { _id: ada, name: "Ada" },
        { _id: grace, name: "Grace" },
      ],
      answers: [
        { playerId: ada, date: "2026-10-01", answer: "free" },
        { playerId: grace, date: "2026-10-17", answer: "busy" },
        { playerId: ada, date: "2026-10-31", answer: "maybe" },
      ],
      sessions: [
        { _id: september, date: "2026-09-12" },
        { _id: october, date: "2026-10-17" },
        { _id: december, date: "2026-12-05" },
      ],
    });
  });

  it("leaves out the Players, Answers, and Sessions of other Groups", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    const stranger = await signedInGmWithGroup();
    const mallory = await stranger.as.mutation(api.roster.addPlayer, {
      groupId: stranger.groupId,
      name: "Mallory",
    });
    await seedAnswers(stranger.groupId, mallory, { "2026-10-17": "free" });
    await seedSession(stranger.groupId, stranger.userId, "2026-10-17");

    const schedule = await as.query(api.schedule.month, { groupId, month: "2026-10" });

    expect(schedule).toEqual({ players: [], answers: [], sessions: [] });
  });

  it("feeds summarizeMonth for the per-player progress, Best Nights, and Sessions", async () => {
    const { as, groupId, userId } = await signedInGmWithGroup();
    const ada = await as.mutation(api.roster.addPlayer, { groupId, name: "Ada" });
    const grace = await as.mutation(api.roster.addPlayer, { groupId, name: "Grace" });
    await seedAnswers(groupId, ada, {
      "2026-10-09": "free",
      "2026-10-10": "free",
      "2026-10-16": "maybe",
    });
    await seedAnswers(groupId, grace, { "2026-10-09": "busy", "2026-10-10": "free" });
    const sessionId = await seedSession(groupId, userId, "2026-10-10");

    const schedule = await as.query(api.schedule.month, { groupId, month: "2026-10" });
    const summary = summarizeMonth({ month: "2026-10", today: TODAY, ...schedule! });

    expect(summary.bestNights.map((day) => day.date)).toEqual(["2026-10-10", "2026-10-16"]);
    expect(summary.progress.map(({ player, answered }) => [player.name, answered])).toEqual([
      ["Ada", 3],
      ["Grace", 2],
    ]);
    expect(summary.days.find((day) => day.date === "2026-10-10")?.session?._id).toBe(sessionId);
  });

  it("returns null for a foreign Group, so it looks missing", async () => {
    const { as } = await signedInGmWithGroup();
    const stranger = await signedInGmWithGroup();

    expect(
      await as.query(api.schedule.month, { groupId: stranger.groupId, month: "2026-10" }),
    ).toBe(null);
  });

  it("returns null for a removed Group", async () => {
    const { as, groupId } = await signedInGmWithGroup();
    await as.mutation(api.groups.remove, { groupId });

    expect(await as.query(api.schedule.month, { groupId, month: "2026-10" })).toBe(null);
  });

  it("returns null for a malformed Group id", async () => {
    const { as } = await signedInGmWithGroup();

    expect(await as.query(api.schedule.month, { groupId: "not-an-id", month: "2026-10" })).toBe(
      null,
    );
  });

  it.each(["2026-13", "2026-1", "October"])(
    "returns null for the malformed month %j",
    async (month) => {
      const { as, groupId } = await signedInGmWithGroup();

      expect(await as.query(api.schedule.month, { groupId, month })).toBe(null);
    },
  );

  it("returns null for a signed-out caller", async () => {
    const { groupId } = await signedInGmWithGroup();

    expect(await t.query(api.schedule.month, { groupId, month: "2026-10" })).toBe(null);
  });
});
