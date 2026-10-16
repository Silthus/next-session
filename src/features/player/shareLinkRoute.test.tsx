import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { routeTree } from "../../routeTree.gen";
import type { useGm } from "../account/useGm";

const groupId = "group-one" as Id<"groups">;
const playerGroup = {
  groupId,
  name: "Thursday Crew",
  players: [{ _id: "player-ana" as Id<"players">, name: "Ana" }],
  sessions: [],
  timeZone: "Europe/Berlin",
  claimedPlayerId: null,
  removedFromMyGroups: false,
  opensAsGm: false,
};
const queries: Record<string, unknown> = {};
const account: Partial<ReturnType<typeof useGm>> = { status: "account", keepOnReturn: null };

vi.mock("../account/useGm", () => ({ useGm: () => account }));
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">) => queries[getFunctionName(reference)],
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate: vi.fn() }),
}));

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  for (const key of Object.keys(queries)) delete queries[key];
});

describe("/s/$shareToken", () => {
  it("takes the GM's Account to the GM view of its Group, in place of the Share Link", async () => {
    queries["player:group"] = { ...playerGroup, opensAsGm: true };

    const router = renderAt("/s/the-token?month=2026-11");

    await waitFor(() => expect(router.state.location.href).toBe(`/g/${groupId}?month=2026-11`));
    expect(router.history.length).toBe(1);
    expect(screen.queryByText("Thursday Crew")).toBeNull();
  });

  it("drops a month the GM view cannot open", async () => {
    queries["player:group"] = { ...playerGroup, opensAsGm: true };

    const router = renderAt("/s/the-token?month=2026-13");

    await waitFor(() => expect(router.state.location.href).toBe(`/g/${groupId}`));
  });

  it("keeps everyone else on the player view", async () => {
    queries["player:group"] = playerGroup;

    const router = renderAt("/s/the-token");

    expect(await screen.findByText("Thursday Crew")).toBeTruthy();
    expect(router.state.location.href).toBe("/s/the-token");
  });
});
