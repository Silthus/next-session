import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ShowToast } from "../useToast";
import { useRailActions } from "./useRailActions";

type Call = {
  args: Record<string, unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const calls: Record<string, Call[]> = {};

vi.mock("convex/react", () => ({
  useMutation: (reference: FunctionReference<"mutation">) => {
    const name = getFunctionName(reference);
    return (args: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => (calls[name] ??= []).push({ args, resolve, reject }));
  },
}));

const groupId = "g1" as Id<"groups">;
const show = vi.fn<ShowToast>();

function lastToast() {
  const [message, undo] = show.mock.calls.at(-1) ?? [];
  return { message, undo };
}

async function settle(name: string, index: number, failure?: unknown) {
  await act(async () => {
    const call = calls[name]![index]!;
    if (failure === undefined) call.resolve();
    else call.reject(failure);
    await Promise.resolve();
  });
}

beforeEach(() => {
  for (const name of Object.keys(calls)) delete calls[name];
  show.mockReset();
});

describe("useRailActions", () => {
  it("rotates the Share Link once however often Rotate is pressed meanwhile", async () => {
    const { result } = renderHook(() => useRailActions(groupId, show));
    act(() => void result.current.rotate());
    act(() => void result.current.rotate());
    expect(calls["groups:rotateShareToken"]).toHaveLength(1);

    await settle("groups:rotateShareToken", 0);
    expect(lastToast().message).toBe("Link rotated. Old links stopped working.");
  });

  it("undoes the rotation from the toast", async () => {
    const { result } = renderHook(() => useRailActions(groupId, show));
    act(() => void result.current.rotate());
    await settle("groups:rotateShareToken", 0);
    act(() => lastToast().undo?.());
    act(() => void result.current.rotate());
    expect(calls["groups:undoRotateShareToken"]).toEqual([
      expect.objectContaining({ args: { groupId } }),
    ]);
    expect(calls["groups:rotateShareToken"]).toHaveLength(1);

    await settle("groups:undoRotateShareToken", 0);
    expect(lastToast().message).toBe("The old link works again.");
  });

  it("explains a late Undo", async () => {
    const { result } = renderHook(() => useRailActions(groupId, show));
    act(() => void result.current.rotate());
    await settle("groups:rotateShareToken", 0);
    act(() => lastToast().undo?.());
    await settle("groups:undoRotateShareToken", 0, new ConvexError({ code: "UNDO_EXPIRED" }));
    expect(lastToast()).toEqual({
      message: "Too late to undo. Share the new link.",
      undo: undefined,
    });
  });
});
