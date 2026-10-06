import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  forgetPendingKeep,
  keepAfterRedirect,
  keepGroup,
  PENDING_KEEP_KEY,
  resumePendingKeep,
  type Keep,
  type KeepDeps,
} from "./keep";

const keep: Keep = { shareToken: "share-token", playerId: "player-1" as Id<"players"> };
const otherKeep: Keep = { shareToken: "other-token", playerId: "player-2" as Id<"players"> };

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

function fakeDeps(claim: KeepDeps["claim"] = () => Promise.resolve(null)) {
  const calls: string[] = [];
  const storage = new MemoryStorage();
  const deps: KeepDeps = {
    claim: (args) => {
      calls.push(`claim ${args.shareToken} ${args.playerId}`);
      return claim(args);
    },
    storage,
  };
  const signIn = () => {
    calls.push(`signIn, pending ${String(storage.getItem(PENDING_KEEP_KEY))}`);
    return Promise.resolve();
  };
  return { deps, calls, storage, signIn };
}

const refusedWith = (code: string) => () => Promise.reject(new ConvexError({ code }));
const offline = () => Promise.reject(new Error("connection lost"));

describe("keepGroup", () => {
  it("remembers the keep, signs in, then claims the Player and forgets the keep", async () => {
    const { deps, calls, storage, signIn } = fakeDeps();

    const outcome = await keepGroup(keep, signIn, deps);

    expect(outcome).toEqual({ kept: true });
    expect(calls).toEqual([
      `signIn, pending ${JSON.stringify(keep)}`,
      "claim share-token player-1",
    ]);
    expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
  });

  it("throws a failed sign-in and keeps the keep, since the sign-in may have gone through", async () => {
    const { deps, calls, storage } = fakeDeps();

    await expect(keepGroup(keep, offline, deps)).rejects.toThrow("connection lost");

    expect(calls).toEqual([]);
    expect(storage.getItem(PENDING_KEEP_KEY)).toBe(JSON.stringify(keep));
  });

  it("forgets the keep when the server refused the sign-in, since it cannot have gone through", async () => {
    const { deps, storage } = fakeDeps();

    await expect(keepGroup(keep, refusedWith("INVALID_CREDENTIALS"), deps)).rejects.toThrow();

    expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
  });

  it.each(["PLAYER_CLAIMED", "NOT_FOUND", "TOO_MANY_GROUPS"])(
    "returns a %s refusal and forgets the keep, since a retry cannot succeed",
    async (code) => {
      const { deps, storage, signIn } = fakeDeps(refusedWith(code));

      const outcome = await keepGroup(keep, signIn, deps);

      expect(outcome).toEqual({ kept: false, error: new ConvexError({ code }) });
      expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
    },
  );

  it("returns a dropped claim and keeps the keep for the next app start", async () => {
    const { deps, storage, signIn } = fakeDeps(offline);

    const outcome = await keepGroup(keep, signIn, deps);

    expect(outcome).toEqual({ kept: false, error: new Error("connection lost") });
    expect(storage.getItem(PENDING_KEEP_KEY)).toBe(JSON.stringify(keep));
  });
});

describe("keepAfterRedirect", () => {
  it("remembers the keep before leaving for the sign-in, and claims nothing yet", async () => {
    const { calls, storage, signIn } = fakeDeps();

    await keepAfterRedirect(keep, signIn, storage);

    expect(calls).toEqual([`signIn, pending ${JSON.stringify(keep)}`]);
    expect(storage.getItem(PENDING_KEEP_KEY)).toBe(JSON.stringify(keep));
  });

  it("forgets the keep when the sign-in never starts", async () => {
    const { storage } = fakeDeps();

    await expect(keepAfterRedirect(keep, offline, storage)).rejects.toThrow("connection lost");

    expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
  });
});

describe("forgetPendingKeep", () => {
  it("drops a keep someone left behind before saying Not you?", () => {
    const { storage } = fakeDeps();
    storage.setItem(PENDING_KEEP_KEY, JSON.stringify(keep));

    forgetPendingKeep(storage);

    expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
  });
});

describe("resumePendingKeep", () => {
  it("does nothing without a keep left over", async () => {
    const { deps, calls } = fakeDeps();

    expect(await resumePendingKeep(deps)).toBeNull();

    expect(calls).toEqual([]);
  });

  it("claims a keep left over from a dropped connection or a sign-in redirect", async () => {
    const { deps, calls, storage } = fakeDeps();
    storage.setItem(PENDING_KEEP_KEY, JSON.stringify(keep));

    expect(await resumePendingKeep(deps)).toEqual({ keep, outcome: { kept: true } });

    expect(calls).toEqual(["claim share-token player-1"]);
    expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
  });

  it("keeps the keep when the claim drops again", async () => {
    const { deps, storage } = fakeDeps(offline);
    storage.setItem(PENDING_KEEP_KEY, JSON.stringify(keep));

    await resumePendingKeep(deps);

    expect(storage.getItem(PENDING_KEEP_KEY)).toBe(JSON.stringify(keep));
  });

  it("forgets a keep it cannot read", async () => {
    const { deps, calls, storage } = fakeDeps();
    storage.setItem(PENDING_KEEP_KEY, '{"shareToken":42}');

    expect(await resumePendingKeep(deps)).toBeNull();

    expect(calls).toEqual([]);
    expect(storage.getItem(PENDING_KEEP_KEY)).toBeNull();
  });

  it("leaves a newer keep alone when an older claim settles", async () => {
    const { deps, storage } = fakeDeps(() => {
      storage.setItem(PENDING_KEEP_KEY, JSON.stringify(otherKeep));
      return Promise.resolve(null);
    });
    storage.setItem(PENDING_KEEP_KEY, JSON.stringify(keep));

    await resumePendingKeep(deps);

    expect(storage.getItem(PENDING_KEEP_KEY)).toBe(JSON.stringify(otherKeep));
  });
});
