import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectErrorCode,
  type GmClient,
  newBackend,
  signedInGmWithGroup,
  signInAccount,
  type TestBackend,
} from "./model/test.setup";

const NOW = Date.UTC(2026, 9, 3, 23, 30);
const BOOKABLE_DATE = "2026-10-17";
const BOOKABLE_MONTH = "2026-10";

type Reach = {
  shareToken: string;
  rotatedAwayShareToken: string;
  ownPlayerId: Id<"players">;
  foreignPlayerId: Id<"players">;
  account: GmClient;
};

type ForeignCall = (reach: Reach) => Promise<unknown>;

const backendModules = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./*.config.ts"],
  {
    eager: true,
  },
);

const refusedAsMissing =
  (...calls: ForeignCall[]): ForeignCall =>
  async (reach) => {
    for (const call of calls) await expectErrorCode(call(reach), "NOT_FOUND");
  };

const readsAsMissing =
  (...calls: ForeignCall[]): ForeignCall =>
  async (reach) => {
    for (const call of calls) expect(await call(reach)).toBeNull();
  };

const shareTokenCalls: Record<string, ForeignCall> = {
  "player.group": readsAsMissing(({ rotatedAwayShareToken }) =>
    t.query(api.player.group, { shareToken: rotatedAwayShareToken }),
  ),
  "player.answers": readsAsMissing(
    ({ shareToken, foreignPlayerId }) =>
      t.query(api.player.answers, {
        shareToken,
        playerId: foreignPlayerId,
        month: BOOKABLE_MONTH,
      }),
    ({ rotatedAwayShareToken, ownPlayerId }) =>
      t.query(api.player.answers, {
        shareToken: rotatedAwayShareToken,
        playerId: ownPlayerId,
        month: BOOKABLE_MONTH,
      }),
  ),
  "player.join": refusedAsMissing(({ rotatedAwayShareToken }) =>
    t.mutation(api.player.join, { shareToken: rotatedAwayShareToken, name: "Intruder" }),
  ),
  "player.claim": refusedAsMissing(
    ({ account, shareToken, foreignPlayerId }) =>
      account.mutation(api.player.claim, { shareToken, playerId: foreignPlayerId }),
    ({ account, rotatedAwayShareToken, ownPlayerId }) =>
      account.mutation(api.player.claim, {
        shareToken: rotatedAwayShareToken,
        playerId: ownPlayerId,
      }),
  ),
  "player.answer": refusedAsMissing(
    ({ shareToken, foreignPlayerId }) =>
      t.mutation(api.player.answer, {
        shareToken,
        playerId: foreignPlayerId,
        date: BOOKABLE_DATE,
        answer: "busy",
      }),
    ({ rotatedAwayShareToken, ownPlayerId }) =>
      t.mutation(api.player.answer, {
        shareToken: rotatedAwayShareToken,
        playerId: ownPlayerId,
        date: BOOKABLE_DATE,
        answer: "busy",
      }),
  ),
  "player.fillRest": refusedAsMissing(
    ({ shareToken, foreignPlayerId }) =>
      t.mutation(api.player.fillRest, {
        shareToken,
        playerId: foreignPlayerId,
        month: BOOKABLE_MONTH,
      }),
    ({ rotatedAwayShareToken, ownPlayerId }) =>
      t.mutation(api.player.fillRest, {
        shareToken: rotatedAwayShareToken,
        playerId: ownPlayerId,
        month: BOOKABLE_MONTH,
      }),
  ),
};

function takesShareToken(value: unknown) {
  const registered = value as { isPublic?: boolean; exportArgs?: () => string };
  if (registered.isPublic !== true || registered.exportArgs === undefined) return false;
  const args = JSON.parse(registered.exportArgs()) as { value?: Record<string, unknown> };
  return args.value?.shareToken !== undefined;
}

function publicFunctionsTakingAShareToken() {
  return Object.entries(backendModules).flatMap(([path, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => takesShareToken(value))
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

async function shareTokenOf(groupId: Id<"groups">) {
  return await t.run(async (ctx) => (await ctx.db.get("groups", groupId))?.shareToken ?? "");
}

async function groupWithAnsweringPlayer(name: string) {
  const { as, groupId } = await signedInGmWithGroup(t);
  const shareToken = await shareTokenOf(groupId);
  const playerId = await t.mutation(api.player.join, { shareToken, name });
  await t.mutation(api.player.answer, {
    shareToken,
    playerId,
    date: BOOKABLE_DATE,
    answer: "free",
  });
  return { as, groupId, playerId };
}

async function reachAcrossTwoGroups(): Promise<Reach> {
  const own = await groupWithAnsweringPlayer("Ada");
  const foreign = await groupWithAnsweringPlayer("Stranger");
  const rotatedAwayShareToken = await shareTokenOf(own.groupId);
  await own.as.mutation(api.groups.rotateShareToken, { groupId: own.groupId });
  return {
    shareToken: await shareTokenOf(own.groupId),
    rotatedAwayShareToken,
    ownPlayerId: own.playerId,
    foreignPlayerId: foreign.playerId,
    account: (await signInAccount(t)).as,
  };
}

async function playersAndAnswers() {
  return await t.run(async (ctx) => ({
    players: await ctx.db.query("players").collect(),
    answers: await ctx.db.query("answers").collect(),
  }));
}

describe("Share Link scoping", () => {
  it("covers every public function that takes a Share Token", () => {
    expect(Object.keys(shareTokenCalls).sort()).toEqual(publicFunctionsTakingAShareToken().sort());
  });

  it("every Share Token function reaches only Players of the Group behind its current token", async () => {
    const reach = await reachAcrossTwoGroups();
    const before = await playersAndAnswers();

    for (const call of Object.values(shareTokenCalls)) await call(reach);

    expect(await playersAndAnswers()).toEqual(before);
  });
});
