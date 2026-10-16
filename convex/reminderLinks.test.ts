import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { reminderLinkTokenFor } from "./model/reminderLinks";
import { expectErrorCode, newBackend, signInAccount, type TestBackend } from "./model/test.setup";

const NOW = Date.UTC(2026, 9, 16, 9, 0);
const MINUTE = 60_000;
const UNKNOWN_TOKENS = ["", "not-a-token", "AAAAAAAAAAAAAAAAAAAAAA"];

type ReminderLinkCall = (token: string) => Promise<void>;

const backendModules = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./*.config.ts"],
  { eager: true },
);

let t: TestBackend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

async function accountOf(userId: Id<"users">) {
  return (await t.run(async (ctx) => await ctx.db.get("users", userId)))!;
}

async function accountWithReminderLink() {
  const { userId } = await signInAccount(t);
  const token = await t.run(async (ctx) =>
    reminderLinkTokenFor(ctx, (await ctx.db.get("users", userId))!),
  );
  return { userId, token };
}

const status = (token: string) => t.query(api.reminderLinks.status, { token });
const turnOff = (token: string) => t.mutation(api.reminderLinks.turnOff, { token });
const turnOn = (token: string) => t.mutation(api.reminderLinks.turnOn, { token });

describe("reminderLinkTokenFor", () => {
  it("mints a 128-bit token on first use and keeps it on the Account", async () => {
    const { userId, token } = await accountWithReminderLink();

    expect(token).toMatch(/^[\w-]{22}$/);
    expect((await accountOf(userId)).reminderLinkToken).toBe(token);
    expect(
      await t.run(async (ctx) => reminderLinkTokenFor(ctx, (await ctx.db.get("users", userId))!)),
    ).toBe(token);
  });

  it("gives every Account its own token", async () => {
    const first = await accountWithReminderLink();
    const second = await accountWithReminderLink();

    expect(first.token).not.toBe(second.token);
  });
});

describe("reminderLinks", () => {
  it("reads Reminders as on for an Account that never chose", async () => {
    const { token } = await accountWithReminderLink();

    expect(await status(token)).toEqual({ enabled: true });
  });

  it("turns Reminders off and back on with the token, without a session", async () => {
    const { userId, token } = await accountWithReminderLink();

    expect(await turnOff(token)).toBeNull();
    expect(await status(token)).toEqual({ enabled: false });
    expect((await accountOf(userId)).remindersEnabled).toBe(false);

    expect(await turnOn(token)).toBeNull();
    expect(await status(token)).toEqual({ enabled: true });
  });

  it("answers a second press with the same state", async () => {
    const { token } = await accountWithReminderLink();

    await turnOff(token);
    await turnOff(token);

    expect(await status(token)).toEqual({ enabled: false });
  });

  it.each(UNKNOWN_TOKENS)(
    "reads the unknown token %j as null and refuses it as NOT_FOUND",
    async (token) => {
      await accountWithReminderLink();

      expect(await status(token)).toBeNull();
      await expectErrorCode(turnOff(token), "NOT_FOUND");
      await expectErrorCode(turnOn(token), "NOT_FOUND");
    },
  );

  it("refuses with RATE_LIMITED after a burst of 10 presses on one link, and others still work", async () => {
    const leaked = await accountWithReminderLink();
    const other = await accountWithReminderLink();
    for (let press = 0; press < 10; press++) await turnOff(leaked.token);

    await expectErrorCode(turnOn(leaked.token), "RATE_LIMITED");
    expect(await status(leaked.token)).toEqual({ enabled: false });
    expect(await turnOff(other.token)).toBeNull();
  });

  it("lets the link work again a minute after the burst", async () => {
    const { token } = await accountWithReminderLink();
    for (let press = 0; press < 10; press++) await turnOff(token);

    vi.setSystemTime(NOW + MINUTE);

    expect(await turnOn(token)).toBeNull();
  });
});

const reachesOnlyItsOwnSwitch =
  (call: ReminderLinkCall): ReminderLinkCall =>
  async (token) => {
    await call(token);
    for (const unknown of UNKNOWN_TOKENS) await expectErrorCode(call(unknown), "NOT_FOUND");
  };

const reminderLinkCalls: Record<string, ReminderLinkCall> = {
  "reminderLinks.status": async (token) => {
    expect(await status(token)).toEqual({ enabled: expect.any(Boolean) as unknown });
    for (const unknown of UNKNOWN_TOKENS) expect(await status(unknown)).toBeNull();
  },
  "reminderLinks.turnOff": reachesOnlyItsOwnSwitch(async (token) => {
    await turnOff(token);
  }),
  "reminderLinks.turnOn": reachesOnlyItsOwnSwitch(async (token) => {
    await turnOn(token);
  }),
};

function takesReminderLinkToken(value: unknown) {
  const registered = value as { isPublic?: boolean; exportArgs?: () => string };
  if (registered.isPublic !== true || registered.exportArgs === undefined) return false;
  const args = JSON.parse(registered.exportArgs()) as { value?: Record<string, unknown> };
  return args.value?.token !== undefined;
}

function publicFunctionsTakingAReminderLinkToken() {
  return Object.entries(backendModules).flatMap(([path, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => takesReminderLinkToken(value))
      .map(([name]) => `${path.replace(/^\.\/(.*)\.ts$/, "$1")}.${name}`),
  );
}

function withoutRemindersSwitch({ remindersEnabled: _switch, ...rest }: Doc<"users">) {
  return rest;
}

describe("Reminder link scoping", () => {
  it("covers every public function that takes a Reminder link token", () => {
    expect(Object.keys(reminderLinkCalls).sort()).toEqual(
      publicFunctionsTakingAReminderLinkToken().sort(),
    );
  });

  it("every Reminder link function reaches only its own Account's Reminders switch", async () => {
    const own = await accountWithReminderLink();
    const foreign = await accountWithReminderLink();
    await turnOff(foreign.token);
    const ownBefore = await accountOf(own.userId);
    const foreignBefore = await accountOf(foreign.userId);

    for (const call of Object.values(reminderLinkCalls)) await call(own.token);

    expect(await accountOf(foreign.userId)).toEqual(foreignBefore);
    expect(withoutRemindersSwitch(await accountOf(own.userId))).toEqual(
      withoutRemindersSwitch(ownBefore),
    );
    expect(await status(own.token)).toEqual({ enabled: true });
  });
});
