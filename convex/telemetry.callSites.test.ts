import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createYourLink,
  logInAccount,
  newCredentials,
  signInWithGoogle,
  signUpAccount,
  withAuthKeys,
  withGoogleCredentials,
} from "./auth.test.setup";
import type { LogRecord, PostHogEvent } from "./model/telemetry";
import {
  expectErrorCode,
  newBackend,
  signedInGmWithGroup,
  signIn,
  signInAccount,
  type GmClient,
  type TestBackend,
} from "./model/test.setup";

withAuthKeys();
withGoogleCredentials();

const NOW = Date.UTC(2026, 9, 6, 15, 0);
const DAY = 86_400_000;
const SEND = "telemetry:send";

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test_project_token");
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 200 })));
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type SendArgs = { events: string[]; logs: LogRecord[] };

async function scheduledSends() {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter(({ name }) => name === SEND)
      .map(({ _id, args }) => ({ _id, args: args[0] as SendArgs })),
  );
}

async function sendsDuring(action: () => Promise<unknown>) {
  const before = new Set((await scheduledSends()).map(({ _id }) => _id));
  await action();
  return (await scheduledSends()).filter(({ _id }) => !before.has(_id)).map(({ args }) => args);
}

async function eventsDuring(action: () => Promise<unknown>) {
  const sends = await sendsDuring(action);
  for (const send of sends) expect(send).toMatchObject({ events: [expect.any(String)], logs: [] });
  return sends.map(({ events }) => JSON.parse(events[0]!) as PostHogEvent);
}

async function shareTokenOf(groupId: Id<"groups">) {
  return await t.run(async (ctx) => (await ctx.db.get("groups", groupId))!.shareToken);
}

async function firstGroupOf(gm: GmClient) {
  const [group] = await gm.query(api.groups.mine, {});
  return group!.id;
}

async function groupWithPlayer() {
  const gm = await signedInGmWithGroup(t);
  const shareToken = await shareTokenOf(gm.groupId);
  const playerId = await t.mutation(api.player.join, { shareToken, name: "Ada" });
  return { ...gm, shareToken, playerId };
}

describe("with the deployment's PostHog token unset", () => {
  it("schedules nothing anywhere in the core loop", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");

    const sends = await sendsDuring(async () => {
      const link = await createYourLink(t);
      const groupId = await firstGroupOf(link.as);
      const shareToken = await shareTokenOf(groupId);
      await t.mutation(api.player.join, { shareToken, name: "Ada" });
      await link.as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
      await link.as.mutation(api.groups.create, {});
      await signUpAccount(t);
      await t.mutation(internal.cleanup.sweepExpiredGroups, {});
    });

    expect(sends).toEqual([]);
  });
});

describe("sign-in", () => {
  it("tracks link_created with the first Group for Create your link", async () => {
    let link: Awaited<ReturnType<typeof createYourLink>> | undefined;
    const events = await eventsDuring(async () => {
      link = await createYourLink(t);
    });

    const groupId = await firstGroupOf(link!.as);
    const userId = link!.userId;
    expect(events).toEqual([
      {
        event: "next_session:link_created",
        distinct_id: `next-session:${userId}`,
        timestamp: new Date(NOW).toISOString(),
        properties: {
          product: "next-session",
          group_id: groupId,
          $process_person_profile: false,
        },
      },
    ]);
  });

  it("tracks account_created for a new Password Account and nothing for its next log in", async () => {
    const credentials = newCredentials();
    let userId: Id<"users"> | undefined;
    const created = await eventsDuring(async () => {
      ({ userId } = await signUpAccount(t, credentials));
    });
    const loggedIn = await eventsDuring(() => logInAccount(t, credentials));

    expect(created).toEqual([
      expect.objectContaining({
        event: "next_session:account_created",
        distinct_id: `next-session:${userId}`,
        properties: {
          product: "next-session",
          method: "password",
          $set: { next_session_account: true },
        },
      }),
    ]);
    expect(loggedIn).toEqual([]);
  });

  it("tracks account_created for a new Google Account and nothing for its next sign-in", async () => {
    const identity = { sub: "google-sub-telemetry", email: "ada@example.com" };
    let userId: Id<"users"> | undefined;
    const created = await eventsDuring(async () => {
      ({ userId } = await signInWithGoogle(t, identity));
    });
    const signedInAgain = await eventsDuring(() => signInWithGoogle(t, identity));

    expect(created).toEqual([
      expect.objectContaining({
        event: "next_session:account_created",
        distinct_id: `next-session:${userId}`,
        properties: expect.objectContaining({ method: "google" }) as unknown,
      }),
    ]);
    expect(signedInAgain).toEqual([]);
  });

  it("flags a production proof Account under .test as a test account", async () => {
    const events = await eventsDuring(() =>
      signUpAccount(t, { ...newCredentials(), email: "prod-proof+1@example.test" }),
    );

    expect(events[0]?.properties).toMatchObject({ is_test_account: true });
  });
});

describe("GM mutations", () => {
  it("tracks group_created", async () => {
    const { as, userId } = await signInAccount(t);
    let groupId: Id<"groups"> | undefined;

    const events = await eventsDuring(async () => {
      groupId = await as.mutation(api.groups.create, {});
    });

    expect(events).toEqual([
      expect.objectContaining({
        event: "next_session:group_created",
        distinct_id: `next-session:${userId}`,
        properties: { product: "next-session", group_id: groupId },
      }),
    ]);
  });

  it("tracks share_link_rotated", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);

    const events = await eventsDuring(() => as.mutation(api.groups.rotateShareToken, { groupId }));

    expect(events).toEqual([
      expect.objectContaining({
        event: "next_session:share_link_rotated",
        properties: { product: "next-session", group_id: groupId },
      }),
    ]);
  });

  it("tracks session_scheduled with the Roster size and whether it is the Group's first", async () => {
    const { as, groupId } = await groupWithPlayer();

    const first = await eventsDuring(() =>
      as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" }),
    );
    const second = await eventsDuring(() =>
      as.mutation(api.sessions.schedule, { groupId, date: "2026-10-24" }),
    );

    expect(first.map(({ event, properties }) => ({ event, properties }))).toEqual([
      {
        event: "next_session:session_scheduled",
        properties: {
          product: "next-session",
          group_id: groupId,
          player_count: 1,
          is_first_for_group: true,
        },
      },
    ]);
    expect(second[0]?.properties).toMatchObject({ is_first_for_group: false });
  });

  it("tracks session_unscheduled", async () => {
    const { as, groupId } = await signedInGmWithGroup(t);
    const sessionId = await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    const events = await eventsDuring(() => as.mutation(api.sessions.unschedule, { sessionId }));

    expect(events).toEqual([
      expect.objectContaining({
        event: "next_session:session_unscheduled",
        properties: { product: "next-session", group_id: groupId },
      }),
    ]);
  });

  it("tracks groups_saved with the number of Groups the Save moved", async () => {
    const link = await createYourLink(t);
    await link.as.mutation(api.groups.create, {});
    const { code } = await link.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);

    const events = await eventsDuring(() => account.as.mutation(api.account.finishSave, { code }));

    expect(events).toEqual([
      expect.objectContaining({
        event: "next_session:groups_saved",
        distinct_id: `next-session:${account.userId}`,
        properties: { product: "next-session", group_count: 2 },
      }),
    ]);
  });
});

describe("Player mutations", () => {
  it("tracks player_joined as the new Player for a visitor", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    const shareToken = await shareTokenOf(groupId);
    let playerId: Id<"players"> | undefined;

    const events = await eventsDuring(async () => {
      playerId = await t.mutation(api.player.join, { shareToken, name: "Ada" });
    });

    expect(events).toEqual([
      expect.objectContaining({
        event: "next_session:player_joined",
        distinct_id: `next-session:player:${playerId}`,
        properties: {
          product: "next-session",
          group_id: groupId,
          claimed: false,
          $process_person_profile: false,
        },
      }),
    ]);
  });

  it("tracks player_joined as the Account, claimed, when an Account joins", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    const shareToken = await shareTokenOf(groupId);
    const { as, userId } = await signInAccount(t);

    const events = await eventsDuring(() =>
      as.mutation(api.player.join, { shareToken, name: "Ada" }),
    );

    expect(events).toEqual([
      expect.objectContaining({
        distinct_id: `next-session:${userId}`,
        properties: { product: "next-session", group_id: groupId, claimed: true },
      }),
    ]);
  });

  it("tracks player_claimed and player_released", async () => {
    const { groupId, shareToken, playerId } = await groupWithPlayer();
    const { as, userId } = await signInAccount(t);

    const claimed = await eventsDuring(() =>
      as.mutation(api.player.claim, { shareToken, playerId }),
    );
    const released = await eventsDuring(() => as.mutation(api.player.release, { groupId }));

    expect([...claimed, ...released]).toEqual([
      expect.objectContaining({
        event: "next_session:player_claimed",
        distinct_id: `next-session:${userId}`,
        properties: { product: "next-session", group_id: groupId },
      }),
      expect.objectContaining({
        event: "next_session:player_released",
        distinct_id: `next-session:${userId}`,
        properties: { product: "next-session", group_id: groupId },
      }),
    ]);
  });

  it("tracks nothing for a claim of a Player the Account already holds", async () => {
    const { shareToken, playerId } = await groupWithPlayer();
    const { as } = await signInAccount(t);
    await as.mutation(api.player.claim, { shareToken, playerId });

    expect(
      await eventsDuring(() => as.mutation(api.player.claim, { shareToken, playerId })),
    ).toEqual([]);
  });

  it("tracks nothing for a release without a claim", async () => {
    const { groupId } = await signedInGmWithGroup(t);
    const { as } = await signInAccount(t);

    expect(await eventsDuring(() => as.mutation(api.player.release, { groupId }))).toEqual([]);
  });

  it("tracks nothing for answers", async () => {
    const { shareToken, playerId } = await groupWithPlayer();

    const events = await eventsDuring(async () => {
      await t.mutation(api.player.answer, {
        shareToken,
        playerId,
        date: "2026-10-17",
        answer: "free",
      });
      await t.mutation(api.player.fillRest, { shareToken, playerId, month: "2026-10" });
    });

    expect(events).toEqual([]);
  });
});

describe("refused and objected", () => {
  it.each<[string, (gm: GmClient, groupId: Id<"groups">, shareToken: string) => Promise<unknown>]>([
    [
      "a Session on a taken date",
      (gm, groupId) => gm.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" }),
    ],
    [
      "a Session outside the Booking Window",
      (gm, groupId) => gm.mutation(api.sessions.schedule, { groupId, date: "2026-10-01" }),
    ],
    [
      "a join under a taken name",
      (_, __, shareToken) => t.mutation(api.player.join, { shareToken, name: "Ada" }),
    ],
    [
      "a rotation of a foreign Group",
      async (_, groupId) => {
        const stranger = await signInAccount(t);
        return stranger.as.mutation(api.groups.rotateShareToken, { groupId });
      },
    ],
  ])("schedules nothing for %s", async (_, refused) => {
    const { as, groupId, shareToken } = await groupWithPlayer();
    await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });

    const sends = await sendsDuring(() =>
      refused(as, groupId, shareToken).then(
        () => expect.unreachable("the mutation must refuse"),
        () => undefined,
      ),
    );

    expect(sends).toEqual([]);
  });

  it("schedules nothing for a Save with a used claim code", async () => {
    const link = await createYourLink(t);
    const { code } = await link.as.mutation(api.account.startSave, {});
    const account = await signUpAccount(t);
    await account.as.mutation(api.account.finishSave, { code });

    const sends = await sendsDuring(() =>
      expectErrorCode(account.as.mutation(api.account.finishSave, { code }), "CLAIM_INVALID"),
    );

    expect(sends).toEqual([]);
  });

  it("schedules nothing for an Account that objected", async () => {
    const { as, groupId } = await signedInGmWithGroup(t, (backend) =>
      signIn(backend, { email: "objector@example.com", analyticsObjectedAt: NOW - DAY }),
    );

    const sends = await sendsDuring(async () => {
      await as.mutation(api.groups.create, {});
      await as.mutation(api.groups.rotateShareToken, { groupId });
      await as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
      await as.mutation(api.player.join, { shareToken: await shareTokenOf(groupId), name: "Ada" });
    });

    expect(sends).toEqual([]);
  });
});

describe("the redaction contract", () => {
  it("sends no Group name, Player name, Share Token, claim code or email in any event or log", async () => {
    const email = "redact-me@example.com";
    const secrets: string[] = [email, "redact-me", "Dragon Table", "Zoltan Vex"];

    const sends = await sendsDuring(async () => {
      const link = await createYourLink(t);
      const groupId = await firstGroupOf(link.as);
      await link.as.mutation(api.groups.rename, { groupId, name: "Dragon Table" });
      secrets.push(await shareTokenOf(groupId));
      await link.as.mutation(api.groups.rotateShareToken, { groupId });
      const shareToken = await shareTokenOf(groupId);
      secrets.push(shareToken);
      const playerId = await t.mutation(api.player.join, { shareToken, name: "Zoltan Vex" });
      await link.as.mutation(api.sessions.schedule, { groupId, date: "2026-10-17" });
      const { code } = await link.as.mutation(api.account.startSave, {});
      secrets.push(code);
      const account = await signUpAccount(t, { ...newCredentials(), email });
      await account.as.mutation(api.account.finishSave, { code });
      await account.as.mutation(api.player.claim, { shareToken, playerId });
      await account.as.mutation(api.player.release, { groupId });
      await account.as.mutation(api.player.join, { shareToken, name: "Zoltan Vex II" });
      await account.as.mutation(api.groups.create, {});
      await t.mutation(internal.cleanup.sweepExpiredGroups, {});
    });

    expect(
      sends.flatMap(({ events }) =>
        events.map((event) => JSON.parse(event) as PostHogEvent).map(({ event }) => event),
      ),
    ).toEqual([
      "next_session:link_created",
      "next_session:share_link_rotated",
      "next_session:player_joined",
      "next_session:session_scheduled",
      "next_session:account_created",
      "next_session:groups_saved",
      "next_session:player_claimed",
      "next_session:player_released",
      "next_session:player_joined",
      "next_session:group_created",
    ]);
    const sent = JSON.stringify(sends);
    for (const secret of secrets) expect(sent).not.toContain(secret);
  });
});

describe("the Expiry sweep", () => {
  async function seedExpiredGroups(count: number) {
    const { userId } = await signIn(t, { isAnonymous: true });
    await t.run(async (ctx) => {
      for (let n = 0; n < count; n++) {
        await ctx.db.insert("groups", {
          ownerId: userId,
          name: "My group",
          shareToken: `expired${n}`,
          expiresAt: NOW - DAY,
        });
      }
    });
  }

  it("logs once per run with the number of Groups it expired, across pages", async () => {
    await seedExpiredGroups(51);

    const sends = await sendsDuring(async () => {
      await t.mutation(internal.cleanup.sweepExpiredGroups, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });

    expect(sends).toEqual([
      {
        events: [],
        logs: [
          {
            level: "info",
            body: "Expiry sweep finished",
            attributes: { groups_expired: 51 },
            time: NOW,
          },
        ],
      },
    ]);
  });

  it("logs a run that found nothing", async () => {
    const sends = await sendsDuring(() => t.mutation(internal.cleanup.sweepExpiredGroups, {}));

    expect(sends.flatMap(({ logs }) => logs)).toEqual([
      expect.objectContaining({ attributes: { groups_expired: 0 } }),
    ]);
  });
});
