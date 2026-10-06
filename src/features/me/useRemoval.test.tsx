import { act, renderHook } from "@testing-library/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { track } from "../../lib/telemetry";
import type { PlayingGroup } from "./myGroups";
import { useRemoval } from "./useRemoval";

type Call = {
  args: Record<string, unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const calls: Record<string, Call[]> = {};

vi.mock("convex/react", () => ({
  useMutation: (reference: FunctionReference<"mutation">) => {
    const name = getFunctionName(reference);
    const mutation = (args: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => (calls[name] ??= []).push({ args, resolve, reject }));
    return Object.assign(mutation, { withOptimisticUpdate: () => mutation });
  },
}));

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
}));

const group: PlayingGroup = {
  groupId: "group-thursday" as Id<"groups">,
  name: "Thursday Crew",
  shareToken: "thursdayTk",
  playerId: "player-robin" as Id<"players">,
  playerName: "Robin",
  upcomingSessions: [],
  openDates: 0,
};

const show = vi.fn<(message: string, undo?: () => void) => void>();

beforeEach(() => {
  for (const name of Object.keys(calls)) delete calls[name];
  show.mockReset();
  vi.mocked(track).mockReset();
});

describe("useRemoval", () => {
  it("tracks Remove from my groups and its Undo by group id only", async () => {
    const { result } = renderHook(() => useRemoval("2026-10-06", show, vi.fn()));

    act(() => result.current.remove(group));
    expect(calls["player:release"]).toHaveLength(1);
    expect(track).toHaveBeenCalledExactlyOnceWith({
      name: "remove_group_started",
      group_id: "group-thursday",
    });

    const undo = show.mock.calls.at(-1)?.[1];
    act(() => undo?.());
    expect(calls["player:claim"]).toHaveLength(1);
    expect(track).toHaveBeenLastCalledWith({
      name: "remove_group_undone",
      group_id: "group-thursday",
    });
    await act(async () => {
      calls["player:claim"]![0]!.resolve();
      await Promise.resolve();
    });

    expect(track).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toMatch(
      /Thursday Crew|Robin|thursdayTk/,
    );
  });
});
