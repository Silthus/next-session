import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen, within } from "@testing-library/react";
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
  sessions: [],
  timeZone: "Europe/Berlin",
  claimedPlayerId: null,
  removedFromMyGroups: false,
  opensAsGm: false,
  calendarInvites: null,
};
const queries: Record<string, unknown> = {};
const nightOn = (date: string) => ({
  date,
  state: "scheduled",
  startTime: "19:00",
  lengthMinutes: 240,
});
const listeners = new Set<() => void>();
const answer = vi.fn();
const release = vi.fn();
const google = vi.fn();
const noMutation = vi.fn();
const openOwnGroup = vi.fn();
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

const wholeOctober = Object.fromEntries(
  Array.from({ length: 25 }, (_, day) => [`2026-10-${String(day + 7).padStart(2, "0")}`, "busy"]),
);
const keepSessionsCard = { name: "Keep your sessions and get a calendar invite" };

function quietKeepLine() {
  return screen.getByRole("button", { name: "Keep this group" }).closest("p")?.textContent;
}

function updateQuery(key: string, value: unknown) {
  act(() => {
    queries[key] = value;
    for (const listener of listeners) listener();
  });
}

function Page() {
  const [month, setMonth] = useState("2026-10");
  return (
    <PlayerScreen
      shareToken={shareToken}
      requestedMonth={month}
      onMonthChange={setMonth}
      onOwnGroup={openOwnGroup}
    />
  );
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
  account.email = undefined;
  google.mockReset();
  answer.mockReset().mockResolvedValue({ keptNow: false });
  release.mockReset().mockResolvedValue(null);
  noMutation.mockReset().mockResolvedValue(null);
  openOwnGroup.mockReset();
});

describe("PlayerScreen", () => {
  it("opens the GM view when the GM's Account opens its own Share Link", async () => {
    account.status = "account";
    queries["player:group"] = { ...roster, opensAsGm: true };
    renderPage();

    await vi.waitFor(() => expect(openOwnGroup).toHaveBeenCalledWith(groupId));
    expect(screen.queryByText("Thursday Crew")).toBeNull();
  });

  it("stays on the player view when the Group becomes the Account's own while open", async () => {
    account.status = "account";
    renderPage();
    await screen.findByRole("button", { name: /^Wednesday, October 7:/ });

    updateQuery("player:group", { ...roster, opensAsGm: true });

    expect(screen.getByRole("button", { name: /^Wednesday, October 7:/ })).toBeTruthy();
    expect(openOwnGroup).not.toHaveBeenCalled();
  });

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
    await userEvent.click(await screen.findByRole("button", { name: "Bo" }));

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

  it("gives a visitor the Group's calendar file behind its Share Link", async () => {
    queries["player:group"] = { ...roster, sessions: [nightOn("2026-10-16")] };
    renderPage();

    const nextSessions = await screen.findByRole("region", { name: "Next sessions" });
    expect(
      within(nextSessions).getByRole("link", { name: "Add to calendar" }).getAttribute("href"),
    ).toBe(`/cal/s/${shareToken}.ics`);
    expect(within(nextSessions).getByText(/Keep this group to get moves/)).toBeTruthy();
  });

  it("points an Account that keeps the Group to My groups for moves and cancellations", async () => {
    account.status = "account";
    queries["player:group"] = {
      ...roster,
      claimedPlayerId: playerId,
      sessions: [nightOn("2026-10-16")],
    };
    renderPage();

    const nextSessions = await screen.findByRole("region", { name: "Next sessions" });
    expect(within(nextSessions).getByRole("link", { name: "Subscribe on My groups" })).toBeTruthy();
  });

  it("shows Invite sent and where invites go only when player.group says the Account gets them", async () => {
    account.status = "account";
    account.email = "ana@example.com";
    const shown = [];
    for (const calendarInvites of ["on", "off", null] as const) {
      queries["player:group"] = {
        ...roster,
        claimedPlayerId: playerId,
        sessions: [nightOn("2026-10-16")],
        calendarInvites,
      };
      renderPage();
      const nextSessions = await screen.findByRole("region", { name: "Next sessions" });
      shown.push({
        calendarInvites,
        inviteSent: within(nextSessions).queryByText("Invite sent") !== null,
        download: within(nextSessions).queryByRole("link", { name: "Add to calendar" }) !== null,
        invitesGoTo: screen.queryByText("Calendar invites go to ana@example.com.") !== null,
      });
      cleanup();
    }

    expect(shown).toEqual([
      { calendarInvites: "on", inviteSent: true, download: false, invitesGoTo: true },
      { calendarInvites: "off", inviteSent: false, download: true, invitesGoTo: false },
      { calendarInvites: null, inviteSent: false, download: true, invitesGoTo: false },
    ]);
  });

  it("keeps the download for an Account with Session emails off, and says invites are off", async () => {
    account.status = "account";
    account.email = "ana@example.com";
    queries["player:group"] = {
      ...roster,
      claimedPlayerId: playerId,
      sessions: [nightOn("2026-10-16")],
      calendarInvites: "off",
    };
    renderPage();

    const nextSessions = await screen.findByRole("region", { name: "Next sessions" });
    expect(within(nextSessions).getByRole("link", { name: "Add to calendar" })).toBeTruthy();
    expect(within(nextSessions).getByRole("link", { name: "Subscribe on My groups" })).toBeTruthy();
    expect(screen.getByText(/^Calendar invites are off\./)).toBeTruthy();
  });

  it("opens the keep sheet from the done card of a visitor who finished the month", async () => {
    queries["player:answers2026-10"] = wholeOctober;
    renderPage();

    const card = await screen.findByRole("status", keepSessionsCard);
    expect(screen.queryByRole("region", { name: "Keep this group" })).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("dialog", { name: "Keep Thursday Crew" })).toBeTruthy();
  });

  it("keeps through Google from the done card and explains a refusal there", async () => {
    queries["player:answers2026-10"] = wholeOctober;
    google.mockRejectedValue(new Error("offline"));
    renderPage();

    const card = await screen.findByRole("status", keepSessionsCard);
    await userEvent.click(within(card).getByRole("button", { name: "Continue with Google" }));

    expect(google).toHaveBeenCalledWith({ shareToken, playerId });
    expect((await within(card).findByRole("alert")).textContent).toBe(
      "That didn't work. Try again.",
    );
  });

  it("lands on November with the quiet line after Not now, and October reads All set", async () => {
    queries["player:answers2026-10"] = wholeOctober;
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Not now, fill November →" }));

    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeTruthy();
    expect(quietKeepLine()).toBe("Keep this group to get calendar invites.");
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("All set for October ✓")).toBeTruthy();
    expect(screen.queryByRole("status", keepSessionsCard)).toBeNull();
  });

  it("keeps the green done card for an Account that keeps the Group", async () => {
    account.status = "account";
    queries["player:group"] = { ...roster, claimedPlayerId: playerId };
    queries["player:answers2026-10"] = wholeOctober;
    renderPage();

    expect(await screen.findByText("All set for October ✓")).toBeTruthy();
    expect(screen.queryByRole("status", keepSessionsCard)).toBeNull();
  });

  it.each([
    ["an Anonymous GM", "anonymous", false],
    ["an Account that removed the Group", "account", true],
  ] as const)(
    "gives %s the green done card and the quiet line",
    async (_caller, status, removedFromMyGroups) => {
      account.status = status;
      queries["player:group"] = { ...roster, removedFromMyGroups };
      queries["player:answers2026-10"] = wholeOctober;
      renderPage();

      expect(await screen.findByText("All set for October ✓")).toBeTruthy();
      expect(screen.queryByRole("status", keepSessionsCard)).toBeNull();
      expect(quietKeepLine()).toBe("Keep this group to get calendar invites.");
    },
  );

  it("shows an error if the visitor's direct Google sign-in cannot start", async () => {
    queries["player:answers2026-10"] = { "2026-10-07": "free" };
    google.mockRejectedValue(new Error("offline"));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That didn't work. Try again.");
  });
});
