import { describe, expect, it } from "vitest";
import { joinedLine, showsNudge } from "./nudge";

const now = Date.parse("2026-10-04T12:00:00Z");
const day = 86_400_000;

describe("showsNudge", () => {
  it("nudges an Anonymous GM once a Player is on the Roster", () => {
    expect(showsNudge({ anonymous: true, playerCount: 1, dismissedAt: null, now })).toBe(true);
    expect(showsNudge({ anonymous: true, playerCount: 0, dismissedAt: null, now })).toBe(false);
    expect(showsNudge({ anonymous: false, playerCount: 3, dismissedAt: null, now })).toBe(false);
  });

  it("stays away for 7 days after Later", () => {
    const nudge = (dismissedAt: number) =>
      showsNudge({ anonymous: true, playerCount: 2, dismissedAt, now });
    expect(nudge(now - 6 * day)).toBe(false);
    expect(nudge(now - 7 * day)).toBe(true);
  });
});

describe("joinedLine", () => {
  it.each([
    [["Ana"], "Ana joined."],
    [["Ana", "Ben"], "Ana and Ben joined."],
    [["Ana", "Ben", "Chiara"], "Ana, Ben and 1 more joined."],
    [["Ana", "Ben", "Chiara", "Dev", "Eli"], "Ana, Ben and 3 more joined."],
  ])("names %o", (names, line) => {
    expect(joinedLine(names)).toBe(line);
  });
});
