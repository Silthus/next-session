import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  dismissNudge,
  forgetMeasurementOff,
  forgetPlayer,
  hasSeenHint,
  lastGroupId,
  markHintSeen,
  measurementTurnedOff,
  nudgeDismissedAt,
  recallPlayer,
  rememberLastGroup,
  rememberMeasurementOff,
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
    rememberPlayer("group-1", ana, storage);
    rememberPlayer("group-2", ben, storage);

    expect(recallPlayer("group-1", storage)).toEqual(ana);
    expect(recallPlayer("group-2", storage)).toEqual(ben);
    expect(JSON.parse(storage.getItem("next-session.players")!)).toEqual({
      "group-1": ana,
      "group-2": ben,
    });
  });

  it("recalls nobody for a Group it never saw", () => {
    expect(recallPlayer("group-1", storage)).toBeNull();
  });

  it("forgets the Player of one Group and keeps the others", () => {
    rememberPlayer("group-1", ana, storage);
    rememberPlayer("group-2", ben, storage);

    forgetPlayer("group-1", storage);

    expect(recallPlayer("group-1", storage)).toBeNull();
    expect(recallPlayer("group-2", storage)).toEqual(ben);
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an object", "[1,2]"],
    ["a malformed entry", JSON.stringify({ "group-1": { playerId: 7 } })],
  ])("recalls nobody when the stored value is %s", (_case, stored) => {
    storage.setItem("next-session.players", stored);

    expect(recallPlayer("group-1", storage)).toBeNull();
  });

  it("recalls nobody and remembers nothing when storage is blocked", () => {
    const blocked = blockedStorage();

    expect(() => rememberPlayer("group-1", ana, blocked)).not.toThrow();
    expect(recallPlayer("group-1", blocked)).toBeNull();
    expect(() => forgetPlayer("group-1", blocked)).not.toThrow();
  });
});

describe("first-visit hint", () => {
  it("shows once per Group until dismissed", () => {
    expect(hasSeenHint("group-1", storage)).toBe(false);

    markHintSeen("group-1", storage);

    expect(hasSeenHint("group-1", storage)).toBe(true);
    expect(hasSeenHint("group-2", storage)).toBe(false);
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

describe("measurement opt-out", () => {
  it("remembers the choice under next-session.measurementOff until forgotten", () => {
    expect(rememberMeasurementOff(storage)).toBe(true);
    expect(storage.items.get("next-session.measurementOff")).toBe("1");
    expect(measurementTurnedOff(storage)).toBe(true);

    forgetMeasurementOff(storage);

    expect(measurementTurnedOff(storage)).toBe(false);
  });

  it("says it could not remember the choice when the browser blocks storage", () => {
    expect(rememberMeasurementOff(blockedStorage())).toBe(false);
    expect(measurementTurnedOff(blockedStorage())).toBe(false);
    expect(() => forgetMeasurementOff(blockedStorage())).not.toThrow();
  });
});

it("keeps the last Group and nudge working when the browser blocks storage", () => {
  const storage = blockedStorage();
  expect(() => rememberLastGroup("g1", storage)).not.toThrow();
  expect(lastGroupId(storage)).toBeNull();
  expect(() => dismissNudge(1, storage)).not.toThrow();
  expect(nudgeDismissedAt(storage)).toBeNull();
});

describe("default storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("is the page's localStorage by default", () => {
    rememberPlayer("group-1", ana);

    expect(recallPlayer("group-1", localStorage)).toEqual(ana);
  });

  it("remembers nobody instead of crashing when the browser blocks site data", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    rememberPlayer("group-1", ana);

    expect(recallPlayer("group-1")).toBeNull();
    expect(hasSeenHint("group-1")).toBe(false);
  });
});
