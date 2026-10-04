import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  browserStorage,
  dismissNudge,
  forgetPlayer,
  hasSeenHint,
  lastGroupId,
  markHintSeen,
  nudgeDismissedAt,
  recallPlayer,
  rememberLastGroup,
  rememberPlayer,
  returningGroupId,
  type KeyValueStorage,
} from "./storage";

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const ana = { playerId: "player-ana" as Id<"players">, name: "Ana" };
const ben = { playerId: "player-ben" as Id<"players">, name: "Ben" };

function blockedStorage(): KeyValueStorage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe("player identity", () => {
  it("remembers one Player per Group under next-session.players", () => {
    rememberPlayer(storage, "group-1", ana);
    rememberPlayer(storage, "group-2", ben);

    expect(recallPlayer(storage, "group-1")).toEqual(ana);
    expect(recallPlayer(storage, "group-2")).toEqual(ben);
    expect(JSON.parse(storage.getItem("next-session.players")!)).toEqual({
      "group-1": ana,
      "group-2": ben,
    });
  });

  it("recalls nobody for a Group it never saw", () => {
    expect(recallPlayer(storage, "group-1")).toBeNull();
  });

  it("forgets the Player of one Group and keeps the others", () => {
    rememberPlayer(storage, "group-1", ana);
    rememberPlayer(storage, "group-2", ben);

    forgetPlayer(storage, "group-1");

    expect(recallPlayer(storage, "group-1")).toBeNull();
    expect(recallPlayer(storage, "group-2")).toEqual(ben);
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an object", "[1,2]"],
    ["a malformed entry", JSON.stringify({ "group-1": { playerId: 7 } })],
  ])("recalls nobody when the stored value is %s", (_case, stored) => {
    storage.setItem("next-session.players", stored);

    expect(recallPlayer(storage, "group-1")).toBeNull();
  });

  it("recalls nobody and remembers nothing when storage is blocked", () => {
    const blocked = blockedStorage();

    expect(() => rememberPlayer(blocked, "group-1", ana)).not.toThrow();
    expect(recallPlayer(blocked, "group-1")).toBeNull();
    expect(() => forgetPlayer(blocked, "group-1")).not.toThrow();
  });
});

describe("first-visit hint", () => {
  it("shows once per Group until dismissed", () => {
    expect(hasSeenHint(storage, "group-1")).toBe(false);

    markHintSeen(storage, "group-1");

    expect(hasSeenHint(storage, "group-1")).toBe(true);
    expect(hasSeenHint(storage, "group-2")).toBe(false);
    expect(storage.getItem("next-session.playerHint.group-1")).not.toBeNull();
  });
});

describe("last Group", () => {
  it("remembers the Group a GM opened last", () => {
    expect(lastGroupId(storage)).toBeNull();
    rememberLastGroup("g2", storage);
    expect(lastGroupId(storage)).toBe("g2");
    expect(storage.getItem("next-session.lastGroup")).toBe("g2");
  });

  it("sends a returning GM to their last Group while they still own it", () => {
    const groups = [{ id: "g1" }, { id: "g2" }];
    expect(returningGroupId(groups, "g2")).toBe("g2");
    expect(returningGroupId(groups, "gone")).toBe("g1");
    expect(returningGroupId(groups, null)).toBe("g1");
    expect(returningGroupId([], "g2")).toBeUndefined();
    expect(returningGroupId(undefined, "g2")).toBeUndefined();
  });
});

describe("nudge dismissal", () => {
  it("remembers when the GM said Later", () => {
    expect(nudgeDismissedAt(storage)).toBeNull();
    dismissNudge(1_700_000_000_000, storage);
    expect(storage.getItem("next-session.nudgeDismissedAt")).toBe("1700000000000");
    expect(nudgeDismissedAt(storage)).toBe(1_700_000_000_000);
  });

  it("ignores a value it cannot read", () => {
    storage.setItem("next-session.nudgeDismissedAt", "soon");
    expect(nudgeDismissedAt(storage)).toBeNull();
  });
});

it("keeps the last Group and nudge working when the browser blocks storage", () => {
  const storage = blockedStorage();
  expect(() => rememberLastGroup("g1", storage)).not.toThrow();
  expect(lastGroupId(storage)).toBeNull();
  expect(() => dismissNudge(1, storage)).not.toThrow();
  expect(nudgeDismissedAt(storage)).toBeNull();
});

describe("browserStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("is the page's localStorage when the browser allows it", () => {
    rememberPlayer(browserStorage(), "group-1", ana);

    expect(recallPlayer(localStorage, "group-1")).toEqual(ana);
  });

  it("remembers nobody instead of crashing when the browser blocks site data", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    const storage = browserStorage();
    rememberPlayer(storage, "group-1", ana);

    expect(recallPlayer(storage, "group-1")).toBeNull();
    expect(hasSeenHint(storage, "group-1")).toBe(false);
  });
});
