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
  });
});
