import { beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  forgetPlayer,
  hasSeenHint,
  markHintSeen,
  recallPlayer,
  rememberPlayer,
} from "./playerIdentity";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
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
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };

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
