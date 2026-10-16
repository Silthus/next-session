import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as groups from "./groups";
import * as roster from "./roster";
import * as schedule from "./schedule";
import * as sessions from "./sessions";
import {
  expectErrorCode,
  seedSession,
  signedInGmWithGroup,
  type GmClient,
  type TestBackend,
  newBackend,
} from "./model/test.setup";

type Stranger = {
  groupId: Id<"groups">;
  playerId: Id<"players">;
  sessionId: Id<"sessions">;
};

type ForeignCall = (as: GmClient, stranger: Stranger) => Promise<unknown>;

const refusedAsMissing =
  (call: ForeignCall): ForeignCall =>
  async (as, stranger) =>
    await expectErrorCode(call(as, stranger), "NOT_FOUND");

const readsAsMissing =
  (call: ForeignCall): ForeignCall =>
  async (as, stranger) =>
    expect(await call(as, stranger)).toBeNull();

const foreignCalls: Record<string, ForeignCall> = {
  "groups.get": readsAsMissing((as, { groupId }) => as.query(api.groups.get, { groupId })),
  "groups.mine": async (as, { groupId }) =>
    expect((await as.query(api.groups.mine, {})).map(({ id }) => id)).not.toContain(groupId),
  "groups.create": async (as, { groupId }) =>
    expect(await as.mutation(api.groups.create, {})).not.toBe(groupId),
  "groups.rename": refusedAsMissing((as, { groupId }) =>
    as.mutation(api.groups.rename, { groupId, name: "Taken over" }),
  ),
  "groups.remove": refusedAsMissing((as, { groupId }) =>
    as.mutation(api.groups.remove, { groupId }),
  ),
  "groups.rotateShareToken": refusedAsMissing((as, { groupId }) =>
    as.mutation(api.groups.rotateShareToken, { groupId }),
  ),
  "groups.undoRotateShareToken": refusedAsMissing((as, { groupId }) =>
    as.mutation(api.groups.undoRotateShareToken, { groupId }),
  ),
  "schedule.month": readsAsMissing((as, { groupId }) =>
    as.query(api.schedule.month, { groupId, month: "2026-10" }),
  ),
  "roster.addPlayer": refusedAsMissing((as, { groupId }) =>
    as.mutation(api.roster.addPlayer, { groupId, name: "Intruder" }),
  ),
  "roster.renamePlayer": refusedAsMissing((as, { playerId }) =>
    as.mutation(api.roster.renamePlayer, { playerId, name: "Intruder" }),
  ),
  "roster.removePlayer": refusedAsMissing((as, { playerId }) =>
    as.mutation(api.roster.removePlayer, { playerId }),
  ),
  "sessions.schedule": refusedAsMissing((as, { groupId }) =>
    as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" }),
  ),
  "sessions.cancel": refusedAsMissing((as, { sessionId }) =>
    as.mutation(api.sessions.cancel, { sessionId }),
  ),
};

const gmModules = { groups, roster, schedule, sessions };

function publicFunctionsOf(modules: Record<string, Record<string, unknown>>) {
  return Object.entries(modules).flatMap(([moduleName, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => (value as { isPublic?: boolean }).isPublic === true)
      .map(([name]) => `${moduleName}.${name}`),
  );
}

let t: TestBackend;

beforeEach(() => {
  t = newBackend();
});

async function strangerWithEverything(): Promise<Stranger> {
  const { as, groupId } = await signedInGmWithGroup(t);
  const playerId = await as.mutation(api.roster.addPlayer, { groupId, name: "Mira" });
  const sessionId = await seedSession(t, groupId, "2026-10-17");
  return { groupId, playerId, sessionId };
}

async function rowsOf({ groupId, playerId, sessionId }: Stranger) {
  return await t.run(async (ctx) => ({
    group: await ctx.db.get("groups", groupId),
    player: await ctx.db.get("players", playerId),
    session: await ctx.db.get("sessions", sessionId),
  }));
}

describe("owner-only Groups", () => {
  it("covers every public function of the GM modules", () => {
    expect(Object.keys(foreignCalls).sort()).toEqual(publicFunctionsOf(gmModules).sort());
  });

  it("every GM-facing function treats another GM's Group, Player and Session as missing and changes nothing", async () => {
    const { as } = await signedInGmWithGroup(t);
    const stranger = await strangerWithEverything();
    const before = await rowsOf(stranger);

    for (const call of Object.values(foreignCalls)) await call(as, stranger);

    expect(await rowsOf(stranger)).toEqual(before);
  });
});
