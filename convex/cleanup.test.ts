import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNSAVED_GROUP_QUIET_DAYS } from "../shared/limits";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createYourLink, signUpAccount, withAuthKeys } from "./auth.test.setup";
import { insertGroup } from "./model/groups";
import { newBackend, signInAnonymousGm, type TestBackend } from "./model/test.setup";

withAuthKeys();

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;
const QUIET = UNSAVED_GROUP_QUIET_DAYS * DAY;

async function sweep() {
  await t.mutation(internal.cleanup.sweepExpiredGroups, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function groupExists(groupId: Id<"groups">) {
  return (await t.run(async (ctx) => await ctx.db.get("groups", groupId))) !== null;
}

async function seedExpiredGroups(count: number) {
  const { userId } = await signInAnonymousGm(t);
  return await t.run(async (ctx) => {
    const gm = (await ctx.db.get("users", userId))!;
    const groupIds: Id<"groups">[] = [];
    for (let i = 0; i < count; i++) groupIds.push(await insertGroup(ctx, gm));
    return { userId, groupIds };
  });
}

describe("the Expiry sweep", () => {
  it("deletes an Unsaved Group after 30 quiet days and ends its Anonymous GM", async () => {
    const anonymous = await createYourLink(t);
    const [group] = await anonymous.as.query(api.groups.mine, {});
    await anonymous.as.mutation(api.groups.create, {});
    const [, second] = await anonymous.as.query(api.groups.mine, {});
    vi.advanceTimersByTime(QUIET + 1);

    await sweep();

    expect(await groupExists(group!.id)).toBe(false);
    expect(await groupExists(second!.id)).toBe(false);
    expect(await anonymous.as.query(api.account.me, {})).toBeNull();
  });

  it("deletes the Group's Players with it", async () => {
    const anonymous = await createYourLink(t);
    const [group] = await anonymous.as.query(api.groups.mine, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("players", { groupId: group!.id, name: "Ada", nameKey: "ada" });
    });
    vi.advanceTimersByTime(QUIET + 1);

    await sweep();

    const players = await t.run(async (ctx) => await ctx.db.query("players").collect());
    expect(players).toEqual([]);
  });

  it("keeps an Unsaved Group whose quiet days are not up", async () => {
    const anonymous = await createYourLink(t);
    const [group] = await anonymous.as.query(api.groups.mine, {});
    vi.advanceTimersByTime(QUIET - DAY);

    await sweep();

    expect(await groupExists(group!.id)).toBe(true);
  });

  it("keeps an Unsaved Group that activity pushed out", async () => {
    const anonymous = await createYourLink(t);
    const [group] = await anonymous.as.query(api.groups.mine, {});
    vi.advanceTimersByTime(QUIET - DAY);
    await anonymous.as.mutation(api.groups.rename, { groupId: group!.id, name: "Thursday crew" });
    vi.advanceTimersByTime(2 * DAY);

    await sweep();

    expect(await groupExists(group!.id)).toBe(true);
  });

  it("never deletes an Account's Groups", async () => {
    const account = await signUpAccount(t);
    const groupId = await account.as.mutation(api.groups.create, {});
    vi.advanceTimersByTime(10 * QUIET);

    await sweep();

    expect(await groupExists(groupId)).toBe(true);
  });

  it("works through more expired Groups than fit in one page", async () => {
    const { groupIds } = await seedExpiredGroups(120);
    vi.advanceTimersByTime(QUIET + 1);

    await sweep();

    const remaining = await Promise.all(groupIds.map(groupExists));
    expect(remaining.filter(Boolean)).toEqual([]);
  });
});
