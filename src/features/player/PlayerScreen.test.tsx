import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useState, useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { useGm } from "../account/useGm";
import { rememberPlayer } from "../../lib/storage";
import { PlayerScreen } from "./PlayerScreen";

const groupId = "group-one" as Id<"groups">;
const playerId = "player-ana" as Id<"players">;
const shareToken = "test-share-token";
const roster = {
  groupId,
  name: "Thursday Crew",
  players: [
    { _id: playerId, name: "Ana" },
    { _id: "player-bo" as Id<"players">, name: "Bo" },
  ],
  sessionDates: [],
  claimedPlayerId: null,
  removedFromMyGroups: false,
};
const queries: Record<string, unknown> = {};
const listeners = new Set<() => void>();
const answer = vi.fn();
const release = vi.fn();
const google = vi.fn();
const noMutation = vi.fn();
const account: Partial<ReturnType<typeof useGm>> = {
  status: "signedOut",
  email: undefined,
  keepOnReturn: null,
  refusalOnReturn: undefined,
  keepWithGoogle: google,
  forgetPendingKeep: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("../account/useGm", () => ({ useGm: () => account }));
vi.mock(import("./useTodayUtc"), () => ({ useTodayUtc: () => "2026-10-07" }));
vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">, args: { month?: string }) => {
    const key = getFunctionName(reference) + (args.month ?? "");
    return useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => queries[key],
    );
  },
  useMutation: (reference: FunctionReference<"mutation">) => {
    const name = getFunctionName(reference);
    const run =
      name === "player:answer" ? answer : name === "player:release" ? release : noMutation;
    return Object.assign(run, { withOptimisticUpdate: () => run });
  },
}));

function updateQuery(key: string, value: unknown) {
  act(() => {
    queries[key] = value;
    for (const listener of listeners) listener();
  });
}

function Page() {
  const [month, setMonth] = useState("2026-10");
  return <PlayerScreen shareToken={shareToken} requestedMonth={month} onMonthChange={setMonth} />;
}

function renderPage() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const key of Object.keys(queries)) delete queries[key];
  queries["player:group"] = roster;
  queries["player:answers2026-10"] = {};
  queries["player:answers2026-11"] = {};
  rememberPlayer(groupId, { playerId, name: "Ana" });
  account.status = "signedOut";
  google.mockReset();
  answer.mockReset().mockResolvedValue({ keptNow: false });
  release.mockReset().mockResolvedValue(null);
  noMutation.mockReset().mockResolvedValue(null);
});

describe("PlayerScreen", () => {
  it("waits for the first answer to save before showing the visitor nudge", async () => {
    let finish: (result: { keptNow: boolean }) => void = () => undefined;
    const saving = new Promise<{ keptNow: boolean }>((resolve) => {
      finish = resolve;
    });
    answer.mockReturnValue(saving);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Wednesday, October 7:/ }));
    updateQuery("player:answers2026-10", { "2026-10-07": "free" });
    expect(screen.queryByRole("region", { name: "Keep this group" })).toBeNull();

    await act(async () => {
      finish({ keptNow: false });
      await saving;
    });

    expect(await screen.findByRole("region", { name: "Keep this group" })).toBeTruthy();
  });

  it("keeps Not you selected when the first answer claims after the click", async () => {
    account.status = "account";
    let finish: (result: { keptNow: boolean }) => void = () => undefined;
    const saving = new Promise<{ keptNow: boolean }>((resolve) => {
      finish = resolve;
    });
    answer.mockReturnValue(saving);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Wednesday, October 7:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Not you?" }));
    expect(await screen.findByRole("heading", { name: "Who are you?" })).toBeTruthy();

    await act(async () => {
      finish({ keptNow: true });
      await saving;
    });
    updateQuery("player:group", { ...roster, claimedPlayerId: playerId });

    expect(screen.queryByText("Answering as")).toBeNull();
    expect(screen.getByRole("heading", { name: "Who are you?" })).toBeTruthy();
    expect(release).toHaveBeenCalledWith({ groupId });
  });

  it("keeps the newly picked name when the rejected Player's claim arrives late", async () => {
    account.status = "account";
    let finish: (result: { keptNow: boolean }) => void = () => undefined;
    const saving = new Promise<{ keptNow: boolean }>((resolve) => {
      finish = resolve;
    });
    answer.mockReturnValue(saving);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Wednesday, October 7:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Not you?" }));
    await userEvent.click(await screen.findByRole("button", { name: "Bo", exact: true }));

    await act(async () => {
      finish({ keptNow: true });
      await saving;
    });
    updateQuery("player:group", { ...roster, claimedPlayerId: playerId });

    expect(screen.getByText(/Answering as/).textContent).toContain("Bo");
    expect(release).toHaveBeenCalledWith({ groupId });
  });

  it("offers keeping when the visitor reaches a month with saved answers", async () => {
    queries["player:answers2026-11"] = { "2026-11-02": "free" };
    renderPage();
    await screen.findByRole("heading", { name: "October 2026" });
    expect(screen.queryByRole("region", { name: "Keep this group" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));

    expect(await screen.findByRole("region", { name: "Keep this group" })).toBeTruthy();
  });

  it("shows an error if the visitor's direct Google sign-in cannot start", async () => {
    queries["player:answers2026-10"] = { "2026-10-07": "free" };
    google.mockRejectedValue(new Error("offline"));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That didn't work. Try again.");
  });
});
