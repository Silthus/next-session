import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { sessionErrorMessage } from "./sessionErrors";

describe("sessionErrorMessage", () => {
  it.each([
    [{ code: "SESSION_EXISTS" }, "That night is already scheduled."],
    [{ code: "OUT_OF_WINDOW" }, "That date can't change anymore."],
    [{ code: "NOT_FOUND" }, "That Session is gone already."],
    [
      { code: "RATE_LIMITED", retryAfter: 4000 },
      "Too many changes at once. Try again in a moment.",
    ],
  ])("explains %o", (data, message) => {
    expect(sessionErrorMessage(new ConvexError(data))).toBe(message);
  });

  it("falls back to a retry line for anything else", () => {
    expect(sessionErrorMessage(new Error("Server Error"))).toBe("That didn't work. Try again.");
    expect(sessionErrorMessage(new ConvexError({ code: "CLAIM_INVALID" }))).toBe(
      "That didn't work. Try again.",
    );
    expect(sessionErrorMessage(new ConvexError("plain"))).toBe("That didn't work. Try again.");
  });
});
