import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { AppErrorData, ErrorCode } from "./model/errors";
import {
  type GmClient,
  newBackend,
  signedInGmWithGroup,
  signInAccount,
  signInAnonymousGm,
  type TestBackend,
} from "./model/test.setup";

const NOW = Date.UTC(2026, 9, 3, 23, 30);
const BOOKABLE_DATE = "2026-10-17";
const BOOKABLE_MONTH = "2026-10";

type Caller = GmClient | TestBackend;
type Locked = { shareToken: string; playerId: Id<"players"> };
type LockedCall = (caller: Caller, locked: Locked) => Promise<unknown>;

const backendModules = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./*.config.ts"],
  { eager: true },
);

const readsAsMissing =
  (read: LockedCall): LockedCall =>
  async (caller, locked) => {
    expect(await read(caller, locked)).toBeNull();
  };

const refusedWith =
  (codes: ErrorCode[], write: LockedCall): LockedCall =>
  async (caller, locked) => {
    const error: unknown = await write(caller, locked).then(
      () => null,
      (refusal: unknown) => refusal,
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(codes).toContain((error as ConvexError<AppErrorData>).data.code);
  };

const lockedCalls: Record<string, LockedCall> = {
  "player.answers": readsAsMissing(
    async (caller, locked) =>
      await caller.query(api.player.answers, { ...locked, month: BOOKABLE_MONTH }),
  ),
  "player.othersAnswers": readsAsMissing(
    async (caller, locked) =>
      await caller.query(api.player.othersAnswers, { ...locked, month: BOOKABLE_MONTH }),
  ),
  "player.answer": refusedWith(
    ["PLAYER_LOCKED"],
    async (caller, locked) =>
      await caller.mutation(api.player.answer, { ...locked, date: BOOKABLE_DATE, answer: "busy" }),
  ),
  "player.fillRest": refusedWith(
    ["PLAYER_LOCKED"],
    async (caller, locked) =>
      await caller.mutation(api.player.fillRest, { ...locked, month: BOOKABLE_MONTH }),
  ),
  "player.claim": refusedWith(
    ["PLAYER_CLAIMED", "UNAUTHENTICATED"],
    async (caller, locked) => await caller.mutation(api.player.claim, locked),
  ),
};

function takesAPlayerOnAShareLink(value: unknown) {
  const registered = value as { isPublic?: boolean; exportArgs?: () => string };
  if (registered.isPublic !== true || registered.exportArgs === undefined) return false;
  const args = JSON.parse(registered.exportArgs()) as { value?: Record<string, unknown> };
  return args.value?.shareToken !== undefined && args.value.playerId !== undefined;
}

function publicFunctionsTakingAPlayerOnAShareLink() {
  return Object.entries(backendModules).flatMap(([path, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => takesAPlayerOnAShareLink(value))
      .map(([name]) => `${path.replace(/^\.\/(.*)\.ts$/, "$1")}.${name}`),
  );
}

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function claimedPlayerWithAnAnswer() {
  const gm = await signedInGmWithGroup(t);
  const shareToken = await t.run(
    async (ctx) => (await ctx.db.get("groups", gm.groupId))?.shareToken ?? "",
  );
  const account = await signInAccount(t);
  const playerId = await account.as.mutation(api.player.join, { shareToken, name: "Ada" });
  await account.as.mutation(api.player.answer, {
    shareToken,
    playerId,
    date: BOOKABLE_DATE,
    answer: "free",
  });
  return { gm: gm.as, account: account.as, locked: { shareToken, playerId } };
}

async function playersAndAnswers() {
  return await t.run(async (ctx) => ({
    players: await ctx.db.query("players").collect(),
    answers: await ctx.db.query("answers").collect(),
  }));
}

describe("Claimed Player lock", () => {
  it("covers every public function that takes a Player through a Share Link", () => {
    expect(Object.keys(lockedCalls).sort()).toEqual(
      publicFunctionsTakingAPlayerOnAShareLink().sort(),
    );
  });

  it("every Player function refuses a Claimed Player to everyone but its Account", async () => {
    const { gm, account, locked } = await claimedPlayerWithAnAnswer();
    const callers = [t, (await signInAnonymousGm(t)).as, (await signInAccount(t)).as, gm];
    const before = await playersAndAnswers();

    for (const caller of callers) {
      for (const call of Object.values(lockedCalls)) await call(caller, locked);
    }

    expect(await playersAndAnswers()).toEqual(before);
    expect(await account.query(api.player.answers, { ...locked, month: BOOKABLE_MONTH })).toEqual({
      [BOOKABLE_DATE]: "free",
    });
  });
});
