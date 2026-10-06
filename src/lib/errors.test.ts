import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appErrorOf, errorMessage } from "./errors";
import { reportError } from "./telemetry";

vi.mock(import("./telemetry"), async (original) => ({
  ...(await original()),
  reportError: vi.fn(),
}));

function convexFailure(path: string, serverMessage: string) {
  return new Error(`[CONVEX M(${path})] ${serverMessage}\n  Called by client`);
}

function codedFailure(data: { code: string; retryAfter?: number }) {
  const error = new ConvexError(data);
  error.message = `[CONVEX M(player:join)] [Request ID: 1a2b3c] Server Error\nUncaught ConvexError: ${JSON.stringify(data)}`;
  return error;
}

beforeEach(() => {
  vi.mocked(reportError).mockReset();
});

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
      "Your own groups didn't move: an account holds up to 50. Delete some to make room.",
    ],
    ["save", { code: "CLAIM_INVALID" }, "Your own groups didn't move: the save expired."],
    ["keep", { code: "NOT_FOUND" }, "That player is gone already."],
    [
      "undoRemove",
      { code: "PLAYER_CLAIMED" },
      "Another account keeps that player now. Ask your GM.",
    ],
    [
      "undoRemove",
      { code: "NOT_FOUND" },
      "Couldn't put it back. Open the group's link and tap Keep this group.",
    ],
    [
      "undoRemove",
      { code: "TOO_MANY_GROUPS" },
      "You keep 50 groups. Remove one from My groups first.",
    ],
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

describe("reporting unexpected Convex failures", () => {
  it("reports a failure without an ErrorCode with its function name and request ID", () => {
    errorMessage(convexFailure("player:answer", "[Request ID: 7f3e9a01] Server Error"), "answer");

    expect(reportError).toHaveBeenCalledOnce();
    const [reported, context] = vi.mocked(reportError).mock.calls[0]!;
    expect(context).toEqual({
      surface: "convex",
      convex_function: "player:answer",
      convex_request_id: "7f3e9a01",
    });
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).name).toBe("ConvexServerError");
    expect((reported as Error).message).toBe("player:answer failed");
  });

  it("reports nothing of the server's message, which can carry names", () => {
    const failure = convexFailure(
      "player:join",
      '[Request ID: 7f3e9a01] Server Error\nArgumentValidationError: Value "Robin" does not match',
    );
    errorMessage(failure, "join");

    expect(JSON.stringify(vi.mocked(reportError).mock.calls)).not.toContain("Robin");
    const [reported] = vi.mocked(reportError).mock.calls[0]!;
    expect((reported as Error).stack).not.toContain("Robin");
  });

  it("reports a failure without a request ID by its function name", () => {
    errorMessage(convexFailure("groups:create", "Server Error"), "group");

    expect(vi.mocked(reportError).mock.calls[0]![1]).toEqual({
      surface: "convex",
      convex_function: "groups:create",
    });
  });

  it("does not report a coded error: it is product flow", () => {
    errorMessage(codedFailure({ code: "RATE_LIMITED", retryAfter: 1000 }), "answer");
    appErrorOf(codedFailure({ code: "PLAYER_CLAIMED" }));

    expect(reportError).not.toHaveBeenCalled();
  });

  it("does not report an error that did not come from a Convex call", () => {
    errorMessage(new Error("The server refused the new sign-in"), "keep");
    errorMessage("offline", "keep");

    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports the same failure once, however often it is read", () => {
    const failure = convexFailure("player:claim", "[Request ID: 0c0ffee1] Server Error");
    appErrorOf(failure);
    errorMessage(failure, "keep");
    errorMessage(failure, "keep");

    expect(reportError).toHaveBeenCalledOnce();
  });
});
