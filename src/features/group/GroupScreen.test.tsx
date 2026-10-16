import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthOf, todayUtc } from "../../../shared/dates";
import type { useGm } from "../account/useGm";
import { monthLabel } from "./calendar/calendarDates";
import { GroupScreen } from "./GroupScreen";

const group = { id: "group-one", name: "Thursday Crew", shareToken: "test-share-token" };
const schedule = {
  players: [],
  answers: [],
  sessions: [],
  timeAndPlace: { startTime: "19:00", lengthMinutes: 240, timeZone: "Europe/Berlin", saved: true },
};
const queries: Record<string, unknown> = {};
const listeners = new Set<() => void>();
const noMutation = vi.fn();
const gm: Partial<ReturnType<typeof useGm>> = {
  status: "anonymous",
  resumingSave: false,
  savedOnReturn: false,
  refusalOnReturn: undefined,
  acknowledgeReturn: vi.fn(),
};

vi.mock("../account/useGm", () => ({ useGm: () => gm }));
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) => {
    const name = getFunctionName(reference);
    return useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => (args === "skip" ? undefined : queries[name]),
    );
  },
  useMutation: () => Object.assign(noMutation, { withOptimisticUpdate: () => noMutation }),
}));

function arrive(name: string, value: unknown) {
  act(() => {
    queries[name] = value;
    for (const listener of listeners) listener();
  });
}

function renderGroupScreen() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <GroupScreen groupId={group.id} search={{}} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

const monthHeading = monthLabel(monthOf(todayUtc(Date.now())));
const groupMenu = () => screen.findByRole("button", { name: "Thursday Crew" });

beforeEach(() => {
  localStorage.clear();
  for (const name of Object.keys(queries)) delete queries[name];
  queries["groups:get"] = group;
  queries["groups:mine"] = [{ id: group.id, name: group.name, playerCount: 0 }];
});

describe("GroupScreen", () => {
  it("keeps the group menu open when the month arrives after it was opened", async () => {
    renderGroupScreen();
    await userEvent.click(await groupMenu());
    expect((await groupMenu()).getAttribute("aria-expanded")).toBe("true");

    arrive("schedule:month", schedule);

    expect(await screen.findByRole("heading", { level: 2, name: monthHeading })).toBeTruthy();
    expect((await groupMenu()).getAttribute("aria-expanded")).toBe("true");
  });
});
