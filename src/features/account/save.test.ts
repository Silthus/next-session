import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { log, track } from "../../lib/telemetry";
import {
  finishLeftOverSave,
  finishPendingSave,
  PENDING_SAVE_KEY,
  saveGroups,
  saveThroughGoogle,
  type SaveDeps,
} from "./save";

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
  log: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(track).mockReset();
  vi.mocked(log).mockReset();
});

const groupId = "group-1" as Id<"groups">;

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

function fakeDeps(overrides: Partial<SaveDeps> = {}) {
  const calls: string[] = [];
  const storage = new MemoryStorage();
  const deps: SaveDeps = {
    startSave: () => {
      calls.push("startSave");
      return Promise.resolve({ code: "claim-code" });
    },
    signIn: (provider, params) => {
      calls.push(`signIn ${provider} ${params.flow} ${params.email}`);
      calls.push(`pending ${storage.getItem(PENDING_SAVE_KEY)}`);
      return Promise.resolve();
    },
    finishSave: ({ code }) => {
      calls.push(`finishSave ${code}`);
      return Promise.resolve({ groupIds: [groupId] });
    },
    storage,
    ...overrides,
  };
  return { deps, calls, storage };
}

const claimInvalid = () => Promise.reject(new ConvexError({ code: "CLAIM_INVALID" }));
const offline = () => Promise.reject(new Error("connection lost"));
const input = { email: "ada@example.com", password: "correct horse battery" };

describe("saveGroups", () => {
  it("claims, creates the Account, then moves the Groups onto it", async () => {
    const { deps, calls, storage } = fakeDeps();

    const result = await saveGroups({ ...input, mode: "create" }, deps);

    expect(result).toEqual({ groupIds: [groupId] });
    expect(calls).toEqual([
      "startSave",
      "signIn password signUp ada@example.com",
      "pending claim-code",
      "finishSave claim-code",
    ]);
    expect(storage.getItem(PENDING_SAVE_KEY)).toBeNull();
  });

  it("logs in to an existing Account when the GM already has one", async () => {
    const { deps, calls } = fakeDeps();

    await saveGroups({ ...input, mode: "logIn" }, deps);

    expect(calls).toContain("signIn password signIn ada@example.com");
  });

  it("keeps the claim when the sign-in fails, since it may have gone through", async () => {
    const { deps, calls, storage } = fakeDeps({
      signIn: () => Promise.reject(new Error("Connection lost while action was in flight")),
    });

    await expect(saveGroups({ ...input, mode: "logIn" }, deps)).rejects.toThrow("Connection lost");

    expect(calls).not.toContain("finishSave claim-code");
    expect(storage.getItem(PENDING_SAVE_KEY)).toBe("claim-code");
  });

  it("keeps the claim for the next start when the connection drops after the sign-in", async () => {
    const { deps, storage } = fakeDeps({ finishSave: offline });

    await expect(saveGroups({ ...input, mode: "create" }, deps)).rejects.toThrow("connection lost");

    expect(storage.getItem(PENDING_SAVE_KEY)).toBe("claim-code");
  });

  it("forgets a claim the server refuses", async () => {
    const { deps, storage } = fakeDeps({ finishSave: claimInvalid });

    await expect(saveGroups({ ...input, mode: "create" }, deps)).rejects.toThrow();

    expect(storage.getItem(PENDING_SAVE_KEY)).toBeNull();
  });
});

describe("finishPendingSave", () => {
  it("redeems the pending claim instead of starting a new Save", async () => {
    const { deps, calls, storage } = fakeDeps();
    storage.setItem(PENDING_SAVE_KEY, "left-over");

    expect(await finishPendingSave(deps)).toEqual({ groupIds: [groupId] });
    expect(calls).toEqual(["finishSave left-over"]);
    expect(storage.getItem(PENDING_SAVE_KEY)).toBeNull();
  });

  it("fails as an invalid claim once the server refused the pending one", async () => {
    const { deps, calls, storage } = fakeDeps({ finishSave: claimInvalid });
    storage.setItem(PENDING_SAVE_KEY, "expired");
    await expect(finishPendingSave(deps)).rejects.toThrow();

    await expect(finishPendingSave(deps)).rejects.toMatchObject({
      data: { code: "CLAIM_INVALID" },
    });
    expect(calls).toEqual([]);
  });
});

describe("finishLeftOverSave", () => {
  it("moves the Groups of a Save the sign-in already went through for", async () => {
    const { deps, calls, storage } = fakeDeps();
    storage.setItem(PENDING_SAVE_KEY, "left-over");

    await finishLeftOverSave(deps);

    expect(calls).toEqual(["finishSave left-over"]);
  });

  it("does nothing without a Save left over", async () => {
    const { deps, calls } = fakeDeps();

    await finishLeftOverSave(deps);

    expect(calls).toEqual([]);
  });
});

describe("a Save and the resume racing on one claim", () => {
  it("redeems the claim once and both see the moved Groups", async () => {
    let redemptions = 0;
    let resumed: Promise<unknown> = Promise.resolve();
    const { deps } = fakeDeps({
      finishSave: () =>
        ++redemptions === 1 ? Promise.resolve({ groupIds: [groupId] }) : claimInvalid(),
    });
    deps.signIn = () => {
      resumed = finishPendingSave(deps);
      return Promise.resolve();
    };

    const saved = await saveGroups({ ...input, mode: "create" }, deps);

    expect(saved).toEqual({ groupIds: [groupId] });
    expect(await resumed).toEqual({ groupIds: [groupId] });
    expect(redemptions).toBe(1);
  });
});

describe("overlapping Saves", () => {
  it("leave a newer pending claim alone when an older one is refused", async () => {
    const { deps, storage } = fakeDeps({ finishSave: claimInvalid });
    deps.signIn = () => {
      storage.setItem(PENDING_SAVE_KEY, "newer-claim");
      return Promise.resolve();
    };

    await expect(saveGroups({ ...input, mode: "create" }, deps)).rejects.toThrow();

    expect(storage.getItem(PENDING_SAVE_KEY)).toBe("newer-claim");
  });
});

describe("saveThroughGoogle", () => {
  it("claims before leaving for Google, so the way back can move the Groups", async () => {
    const { deps, calls, storage } = fakeDeps();
    const continueWithGoogle = () => {
      calls.push(`leave for Google, pending ${storage.getItem(PENDING_SAVE_KEY)}`);
      return Promise.resolve();
    };

    await saveThroughGoogle({ ...deps, continueWithGoogle });
    const onReturn = await finishPendingSave(deps);

    expect(calls).toEqual([
      "startSave",
      "leave for Google, pending claim-code",
      "finishSave claim-code",
    ]);
    expect(onReturn).toEqual({ groupIds: [groupId] });
  });

  it("stays on the page when the claim fails", async () => {
    const { deps } = fakeDeps({ startSave: offline });
    const continueWithGoogle = vi.fn(() => Promise.resolve());

    await expect(saveThroughGoogle({ ...deps, continueWithGoogle })).rejects.toThrow();
    expect(continueWithGoogle).not.toHaveBeenCalled();
  });
});

describe("save telemetry", () => {
  it("tracks the start of a password Save once, even when it fails", async () => {
    const { deps } = fakeDeps({ finishSave: offline });

    await expect(saveGroups({ ...input, mode: "create" }, deps)).rejects.toThrow();

    expect(track).toHaveBeenCalledExactlyOnceWith({ name: "save_started" });
  });

  it("tracks the start of a Save through Google", async () => {
    const { deps } = fakeDeps();

    await saveThroughGoogle({ ...deps, continueWithGoogle: () => Promise.resolve() });

    expect(track).toHaveBeenCalledExactlyOnceWith({ name: "save_started" });
  });

  it("logs a recovered Save once, without its claim code", async () => {
    const { deps, storage } = fakeDeps();
    storage.setItem(PENDING_SAVE_KEY, "claim-code");

    await Promise.all([finishPendingSave(deps), finishPendingSave(deps)]);

    expect(log).toHaveBeenCalledExactlyOnceWith("info", "Pending save finished", {
      outcome: "saved",
    });
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain("claim-code");
  });

  it("logs a recovery the server refused with its code", async () => {
    const { deps, storage } = fakeDeps({ finishSave: claimInvalid });
    storage.setItem(PENDING_SAVE_KEY, "claim-code");

    await expect(finishPendingSave(deps)).rejects.toThrow();

    expect(log).toHaveBeenCalledExactlyOnceWith("warn", "Pending save refused", {
      outcome: "CLAIM_INVALID",
    });
  });

  it("logs a recovery that failed without a code as unexpected", async () => {
    const { deps, storage } = fakeDeps({ finishSave: offline });
    storage.setItem(PENDING_SAVE_KEY, "claim-code");

    await expect(finishPendingSave(deps)).rejects.toThrow();

    expect(log).toHaveBeenCalledExactlyOnceWith("warn", "Pending save refused", {
      outcome: "unexpected",
    });
  });

  it("logs nothing for a Save that needed no recovery", async () => {
    const { deps } = fakeDeps();

    await saveGroups({ ...input, mode: "logIn" }, deps);

    expect(log).not.toHaveBeenCalled();
  });
});
