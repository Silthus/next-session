import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it.each([
    ["session", { code: "SESSION_EXISTS" }, "That night is already scheduled."],
    ["session", { code: "OUT_OF_WINDOW" }, "That date can't change anymore."],
    ["session", { code: "NOT_FOUND" }, "That session is gone already."],
    ["roster", { code: "NAME_TAKEN", playerId: "p1" }, "That name is already on the list."],
    ["roster", { code: "ROSTER_FULL" }, "This group is full. It holds 100 players."],
    ["roster", { code: "NOT_FOUND" }, "That player is gone already."],
    ["group", { code: "TOO_MANY_GROUPS" }, "You have 50 groups. Delete one to make room."],
    ["group", { code: "NOT_FOUND" }, "That group is gone already."],
    ["shareLink", { code: "UNDO_EXPIRED" }, "Too late to undo. Share the new link."],
    [
      "join",
      { code: "NAME_TAKEN", playerId: "p1" },
      "That name exists. Tap it, or add a last initial.",
    ],
    ["join", { code: "ROSTER_FULL" }, "This group is full. Ask your GM to make room."],
    ["join", { code: "INVALID_NAME" }, "Use a name of up to 60 characters."],
    ["join", { code: "RATE_LIMITED", retryAfter: 4000 }, "Slow down a moment, then try again."],
    ["join", { code: "TOO_MANY_GROUPS" }, "You keep 50 groups. Remove one from My groups first."],
    [
      "keep",
      { code: "PLAYER_CLAIMED" },
      "Another account keeps this name. Add yours with a last initial, or ask your GM.",
    ],
    ["keep", { code: "TOO_MANY_GROUPS" }, "You keep 50 groups. Remove one from My groups first."],
    [
      "save",
      { code: "TOO_MANY_GROUPS" },
      "Your groups didn't move: an account holds up to 50. Delete some, then keep this group again.",
    ],
    [
      "save",
      { code: "CLAIM_INVALID" },
      "Your groups didn't move: the save expired. Keep this group again to keep just this one.",
    ],
    ["keep", { code: "NOT_FOUND" }, "That player is gone already."],
    ["answer", { code: "RATE_LIMITED", retryAfter: 4000 }, "Slow down a moment."],
    ["answer", { code: "OUT_OF_WINDOW" }, "That night is locked now."],
    ["fillRest", { code: "RATE_LIMITED", retryAfter: 4000 }, "Slow down a moment."],
    ["fillRest", { code: "OUT_OF_WINDOW" }, "Those nights are locked now."],
  ] as const)("explains a %s %o", (topic, data, message) => {
    expect(errorMessage(new ConvexError(data), topic)).toBe(message);
  });

  it.each(["session", "roster", "group", "shareLink"] as const)(
    "explains a rate limit and a bad name the same way for a %s",
    (topic) => {
      expect(errorMessage(new ConvexError({ code: "RATE_LIMITED", retryAfter: 4000 }), topic)).toBe(
        "Slow down a moment, then try again.",
      );
      expect(errorMessage(new ConvexError({ code: "INVALID_NAME" }), topic)).toBe(
        "Use 1 to 60 characters.",
      );
    },
  );

  it("falls back to a retry line for anything else", () => {
    expect(errorMessage(new Error("Server Error"), "session")).toBe("That didn't work. Try again.");
    expect(errorMessage(new ConvexError({ code: "CLAIM_INVALID" }), "roster")).toBe(
      "That didn't work. Try again.",
    );
    expect(errorMessage(new ConvexError("plain"), "group")).toBe("That didn't work. Try again.");
    expect(errorMessage(new Error("Server Error"), "join")).toBe("That didn't work. Try again.");
  });

  it.each(["answer", "fillRest"] as const)("asks to retry an unsaved %s", (topic) => {
    expect(errorMessage(new Error("Server Error"), topic)).toBe("That didn't save. Try again.");
    expect(errorMessage(new ConvexError({ code: "NOT_FOUND" }), topic)).toBe(
      "That didn't save. Try again.",
    );
  });
});
