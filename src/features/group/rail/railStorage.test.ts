import { describe, expect, it } from "vitest";
import {
  dismissNudge,
  lastGroupId,
  nudgeDismissedAt,
  rememberLastGroup,
  returningGroupId,
} from "./railStorage";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function brokenStorage(): Storage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

describe("last Group", () => {
  it("remembers the Group a GM opened last", () => {
    const storage = memoryStorage();
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
    const storage = memoryStorage();
    expect(nudgeDismissedAt(storage)).toBeNull();
    dismissNudge(1_700_000_000_000, storage);
    expect(nudgeDismissedAt(storage)).toBe(1_700_000_000_000);
  });

  it("ignores a value it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("next-session.nudgeDismissedAt", "soon");
    expect(nudgeDismissedAt(storage)).toBeNull();
  });
});

it("keeps working when the browser blocks storage", () => {
  const storage = brokenStorage();
  expect(() => rememberLastGroup("g1", storage)).not.toThrow();
  expect(lastGroupId(storage)).toBeNull();
  expect(() => dismissNudge(1, storage)).not.toThrow();
  expect(nudgeDismissedAt(storage)).toBeNull();
});
