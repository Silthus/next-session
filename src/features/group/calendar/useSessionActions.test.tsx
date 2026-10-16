import { act, renderHook } from "@testing-library/react";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ShowToast } from "../useToast";
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
const show = vi.fn<ShowToast>();

function lastToast() {
  const [message, undo] = show.mock.calls.at(-1) ?? [];
  return { message, undo };
}

beforeEach(() => {
  for (const name of Object.keys(calls)) delete calls[name];
  show.mockReset();
});

describe("useSessionActions", () => {
  it("keeps every night pending until its own change settles", async () => {
    const { result } = renderHook(() => useSessionActions(groupId, show));
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
    const { result } = renderHook(() => useSessionActions(groupId, show));
    act(() => void result.current.schedule("2026-11-05"));
    await settle("sessions:schedule", 0, "s5");
    const undoSchedule = lastToast().undo;

    act(() => void result.current.cancel({ _id: "s5" as Id<"sessions">, date: "2026-11-05" }));
    act(() => undoSchedule?.());
    expect(calls["sessions:cancel"]).toHaveLength(1);

    await settle("sessions:cancel", 0, "null");
    expect(result.current.isPending("2026-11-05")).toBe(false);
  });

  it("undoes a new Session with the id the server returned", async () => {
    const { result } = renderHook(() => useSessionActions(groupId, show));
    act(() => void result.current.schedule("2026-11-05"));
    await settle("sessions:schedule", 0, "s5");
    expect(lastToast().message).toBe("Session on Thu, Nov 5. Players see it on the link.");

    act(() => lastToast().undo?.());
    expect(calls["sessions:cancel"]![0]!.args).toEqual({ sessionId: "s5" });
  });

  it("says a Session is cancelled and brings its date back on Undo", async () => {
    const { result } = renderHook(() => useSessionActions(groupId, show));
    act(() => void result.current.cancel({ _id: "s5" as Id<"sessions">, date: "2026-11-05" }));
    expect(calls["sessions:cancel"]![0]!.args).toEqual({ sessionId: "s5" });
    await settle("sessions:cancel", 0, "null");
    expect(lastToast().message).toBe("Session on Thu, Nov 5 cancelled.");

    act(() => lastToast().undo?.());
    expect(calls["sessions:schedule"]![0]!.args).toEqual({ groupId, date: "2026-11-05" });
  });

  it("shows a scheduled night in every cached month of the Group at once", () => {
    renderHook(() => useSessionActions(groupId, show));
    const store = fakeStore({
      "g1|2026-10": [session("s1", "2026-10-09")],
      "g1|2026-11": [session("s1", "2026-10-09")],
      "g2|2026-11": [],
    });

    optimisticUpdates["sessions:schedule"]!(store, { groupId, date: "2026-11-05" });
    expect(store.sessionsShown()).toEqual({
      "g1|2026-10": ["2026-10-09 scheduled", "2026-11-05 scheduled"],
      "g1|2026-11": ["2026-10-09 scheduled", "2026-11-05 scheduled"],
      "g2|2026-11": [],
    });
  });

  it("drops a cancelled Session players never heard of, so Undo right after a schedule leaves no mark", () => {
    renderHook(() => useSessionActions(groupId, show));
    const store = fakeStore({ "g1|2026-11": [session("s1", "2026-11-05", { published: false })] });

    optimisticUpdates["sessions:cancel"]!(store, { sessionId: "s1" });
    expect(store.sessionsShown()).toEqual({ "g1|2026-11": [] });
  });

  it("marks a cancelled Session players have heard of as Cancelled, in every cached month", () => {
    renderHook(() => useSessionActions(groupId, show));
    const store = fakeStore({
      "g1|2026-10": [session("s1", "2026-11-05"), session("s2", "2026-11-12")],
      "g1|2026-11": [session("s1", "2026-11-05"), session("s2", "2026-11-12")],
    });

    optimisticUpdates["sessions:cancel"]!(store, { sessionId: "s1" });
    expect(store.sessionsShown()).toEqual({
      "g1|2026-10": ["2026-11-05 cancelled", "2026-11-12 scheduled"],
      "g1|2026-11": ["2026-11-05 cancelled", "2026-11-12 scheduled"],
    });
  });

  it("schedules a Cancelled night again in place", () => {
    renderHook(() => useSessionActions(groupId, show));
    const store = fakeStore({
      "g1|2026-11": [session("s1", "2026-11-05", { state: "cancelled" })],
    });

    optimisticUpdates["sessions:schedule"]!(store, { groupId, date: "2026-11-05" });
    expect(store.sessions("g1|2026-11")).toEqual([
      session("s1", "2026-11-05", { state: "scheduled" }),
    ]);
  });
});

async function settle(name: string, index: number, value: string) {
  await act(async () => {
    calls[name]![index]!.resolve(value);
    await Promise.resolve();
  });
}

type Session = { _id: string; date: string; state: "scheduled" | "cancelled"; published: boolean };

function session(_id: string, date: string, fields: Partial<Session> = {}): Session {
  return { _id, date, state: "scheduled", published: true, ...fields };
}

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
    sessions: (key: string) => entries.get(key)!.value.sessions,
    sessionsShown: () =>
      Object.fromEntries(
        [...entries].map(([key, entry]) => [
          key,
          entry.value.sessions.map((s) => `${s.date} ${s.state}`),
        ]),
      ),
  };
  return store as unknown as OptimisticLocalStore &
    Pick<typeof store, "sessions" | "sessionsShown">;
}
