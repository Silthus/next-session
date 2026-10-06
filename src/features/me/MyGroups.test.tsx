import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { MyGroups } from "./MyGroups";
import type { MyGroups as MyGroupsData, PlayingGroup } from "./myGroups";

const today = "2026-10-06";

const thursday: PlayingGroup = {
  groupId: "group-thursday" as Id<"groups">,
  name: "Thursday Crew",
  shareToken: "thursdayTk",
  playerId: "player-robin" as Id<"players">,
  playerName: "Robin",
  upcomingSessions: ["2026-10-08", "2026-10-22"],
  openDates: 12,
};

const sunday: PlayingGroup = {
  groupId: "group-sunday" as Id<"groups">,
  name: "Sunday Saga",
  shareToken: "sundaySaga",
  playerId: "player-rob" as Id<"players">,
  playerName: "Rob",
  upcomingSessions: [],
  openDates: 0,
};

const ownTable = {
  groupId: "group-own" as Id<"groups">,
  name: "Dragon Heist",
  upcomingSessions: ["2026-10-10"],
};

const everything: MyGroupsData = { running: [ownTable], playing: [thursday, sunday] };

function renderMyGroups(props: Partial<ComponentProps<typeof MyGroups>> = {}) {
  const handlers = { onCreate: vi.fn(), onRemove: vi.fn(), onLogOut: vi.fn() };
  const rootRoute = createRootRoute({
    component: () => (
      <MyGroups
        email="robin@example.test"
        groups={everything}
        today={today}
        creating={false}
        {...handlers}
        {...props}
      />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/me"] }),
  });
  render(<RouterProvider router={router} />);
  return handlers;
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

describe("MyGroups", () => {
  it("lists the next Sessions across Groups by date, each with its Group", async () => {
    renderMyGroups();

    await screen.findByRole("heading", { level: 1, name: "My groups" });
    const sessions = within(section("Next sessions")).getAllByRole("link");
    expect(sessions.map((link) => link.textContent)).toEqual([
      "Thursday, October 8in 2 daysThursday Crew",
      "Saturday, October 10in 4 daysDragon Heist",
      "Thursday, October 22in 16 daysThursday Crew",
    ]);
    expect(sessions.map((link) => link.getAttribute("href"))).toEqual([
      "/s/thursdayTk",
      "/g/group-own",
      "/s/thursdayTk",
    ]);
  });

  it("says when no Session is scheduled yet", async () => {
    renderMyGroups({ groups: { running: [], playing: [sunday] } });

    await screen.findByRole("heading", { level: 1, name: "My groups" });
    expect(within(section("Next sessions")).getByText("Nothing scheduled yet.")).toBeTruthy();
  });

  it("shows a card per Claimed Player that opens the player page", async () => {
    renderMyGroups();

    const playing = await screen.findByRole("region", { name: "You play in" });
    const [thursdayCard, sundayCard] = within(playing).getAllByRole("listitem");
    const thursdayLink = within(thursdayCard!).getByRole("link");
    expect(thursdayLink.getAttribute("href")).toBe("/s/thursdayTk");
    expect(thursdayLink.textContent).toBe(
      "Thursday Crewas RobinNext session Thu, Oct 812 days to answer",
    );
    expect(within(sundayCard!).getByRole("link").textContent).toBe(
      "Sunday Sagaas RobNo session yet",
    );
  });

  it("removes a Group from My groups through the card's menu", async () => {
    const { onRemove } = renderMyGroups();

    await userEvent.click(await screen.findByRole("button", { name: "Options for Thursday Crew" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from my groups" }));

    expect(onRemove).toHaveBeenCalledWith(thursday);
  });

  it("shows a card per Group the Account runs that opens the GM page", async () => {
    renderMyGroups();

    const running = await screen.findByRole("region", { name: "You run" });
    const link = within(running).getByRole("link");
    expect(link.getAttribute("href")).toBe("/g/group-own");
    expect(link.textContent).toBe("Dragon HeistNext session Sat, Oct 10");
  });

  it("offers a Player who runs nothing to create their own link", async () => {
    const { onCreate } = renderMyGroups({ groups: { running: [], playing: [thursday] } });

    const running = await screen.findByRole("region", { name: "You run" });
    await userEvent.click(within(running).getByRole("button", { name: "Create your link" }));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("points an Account without Groups to its GM's link and to its own", async () => {
    const { onCreate } = renderMyGroups({ groups: { running: [], playing: [] } });

    expect(await screen.findByText("Open your GM's link and tap Keep this group.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Next sessions" })).toBeNull();
    expect(screen.queryByRole("region", { name: "You play in" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Create your link" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("holds Create your link while the link is being made", async () => {
    renderMyGroups({ groups: { running: [], playing: [] }, creating: true });

    expect(await screen.findByRole("button", { name: "Making your link…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("names the Account and lets it log out", async () => {
    const { onLogOut } = renderMyGroups();

    const header = await screen.findByRole("banner");
    expect(within(header).getByText("robin@example.test")).toBeTruthy();
    await userEvent.click(within(header).getByRole("button", { name: "Log out" }));

    expect(onLogOut).toHaveBeenCalledOnce();
  });

  it("puts focus on its heading when it opens, so a redirect lands somewhere", async () => {
    renderMyGroups();

    const heading = await screen.findByRole("heading", { level: 1, name: "My groups" });
    expect(document.activeElement).toBe(heading);
  });

  it("shows a skeleton while the Groups load", async () => {
    renderMyGroups({ groups: undefined });

    expect(await screen.findByText("Loading your groups")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "You play in" })).toBeNull();
  });
});
