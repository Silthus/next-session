import { act, renderHook } from "@testing-library/react";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useSessionActions } from "./useSessionActions";

type Call = { args: Record<string, unknown>; resolve: (value: unknown) => void };
type OptimisticUpdate = (store: OptimisticLocalStore, args: Record<string, unknown>) => void;

const calls: Record<string, Call[]> = {};
const optimisticUpdates: Record<string, OptimisticUpdate> = {};

vi.mock("convex/react", () => ({
  useMutation: (reference: FunctionReference<"mutation">) => {
    const name = getFunctionName(reference);
    const mutate = (args: Record<string, unknown>) =>
      new Promise((resolve) => (calls[name] ??= []).push({ args, resolve }));
    return Object.assign(mutate, {
      withOptimisticUpdate: (update: OptimisticUpdate) => {
        optimisticUpdates[name] = update;
        return mutate;
      },
    });
  },
}));

const groupId = "g1" as Id<"groups">;

beforeEach(() => {
  for (const name of Object.keys(calls)) delete calls[name];
});

describe("useSessionActions", () => {
  it("keeps every night pending until its own change settles", async () => {
    const { result } = renderHook(() => useSessionActions(groupId));
    act(() => void result.current.schedule("2026-11-05"));
    act(() => void result.current.schedule("2026-11-06"));
    expect(result.current.isPending("2026-11-05")).toBe(true);
    expect(result.current.isPending("2026-11-06")).toBe(true);

    await settle("sessions:schedule", 1, "s6");
    expect(result.current.isPending("2026-11-05")).toBe(true);
    expect(result.current.isPending("2026-11-06")).toBe(false);

    await settle("sessions:schedule", 0, "s5");
    expect(result.current.isPending("2026-11-05")).toBe(false);
  });

  it("ignores a second change to a night while the first is on its way", async () => {
    const { result } = renderHook(() => useSessionActions(groupId));
    act(() => void result.current.schedule("2026-11-05"));
    await settle("sessions:schedule", 0, "s5");
    const undoSchedule = result.current.toast?.undo;

    act(() => void result.current.unschedule({ _id: "s5" as Id<"sessions">, date: "2026-11-05" }));
    act(() => undoSchedule?.());
    expect(calls["sessions:unschedule"]).toHaveLength(1);

    await settle("sessions:unschedule", 0, "null");
    expect(result.current.isPending("2026-11-05")).toBe(false);
  });

  it("keeps a held toast, and lets it go five seconds after release", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSessionActions(groupId));
      act(() => void result.current.schedule("2026-11-05"));
      await settle("sessions:schedule", 0, "s5");
      act(() => result.current.holdToast());
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(result.current.toast?.date).toBe("2026-11-05");

      act(() => result.current.releaseToast());
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not carry a hold over to the next toast", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSessionActions(groupId));
      act(() => void result.current.schedule("2026-11-05"));
      await settle("sessions:schedule", 0, "s5");
      act(() => result.current.holdToast());
      act(() => void result.current.schedule("2026-11-06"));
      await settle("sessions:schedule", 1, "s6");

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("undoes a new Session with the id the server returned", async () => {
    const { result } = renderHook(() => useSessionActions(groupId));
    act(() => void result.current.schedule("2026-11-05"));
    await settle("sessions:schedule", 0, "s5");
    expect(result.current.toast?.message).toBe(
      "Session on Thu, Nov 5. Players see it on the link.",
    );

    act(() => result.current.toast?.undo?.());
    expect(calls["sessions:unschedule"]![0]!.args).toEqual({ sessionId: "s5" });
  });

  it("shows a scheduled night in every cached month of the Group at once", () => {
    renderHook(() => useSessionActions(groupId));
    const store = fakeStore({
      "g1|2026-10": [{ _id: "s1", date: "2026-10-09" }],
      "g1|2026-11": [{ _id: "s1", date: "2026-10-09" }],
      "g2|2026-11": [],
    });

    optimisticUpdates["sessions:schedule"]!(store, { groupId, date: "2026-11-05" });
    expect(store.sessionDates()).toEqual({
      "g1|2026-10": ["2026-10-09", "2026-11-05"],
      "g1|2026-11": ["2026-10-09", "2026-11-05"],
      "g2|2026-11": [],
    });

    optimisticUpdates["sessions:unschedule"]!(store, { sessionId: "s1" });
    expect(store.sessionDates()).toEqual({
      "g1|2026-10": ["2026-11-05"],
      "g1|2026-11": ["2026-11-05"],
      "g2|2026-11": [],
    });
  });
});

async function settle(name: string, index: number, value: string) {
  await act(async () => {
    calls[name]![index]!.resolve(value);
    await Promise.resolve();
  });
}

type Session = { _id: string; date: string };

function fakeStore(cached: Record<string, Session[]>) {
  const entries = new Map(
    Object.entries(cached).map(([key, sessions]) => {
      const [groupId, month] = key.split("|");
      return [key, { args: { groupId, month }, value: { players: [], answers: [], sessions } }];
    }),
  );
  const store = {
    getAllQueries: () => [...entries.values()],
    setQuery: (
      _query: unknown,
      args: { groupId: string; month: string },
      value: { sessions: Session[] },
    ) => {
      const key = `${args.groupId}|${args.month}`;
      entries.set(key, { ...entries.get(key)!, value: { ...entries.get(key)!.value, ...value } });
    },
    sessionDates: () =>
      Object.fromEntries(
        [...entries].map(([key, entry]) => [key, entry.value.sessions.map((s) => s.date)]),
      ),
  };
  return store as unknown as OptimisticLocalStore & { sessionDates: typeof store.sessionDates };
}
