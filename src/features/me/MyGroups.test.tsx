import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { track } from "../../lib/telemetry";
import { MyGroups } from "./MyGroups";
import type { MyGroups as MyGroupsData, PlayingGroup, RunningGroup } from "./myGroups";

const viewer = vi.hoisted(() => ({ timeZone: "Europe/Berlin" }));

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
}));
vi.mock("../../lib/timeZone", () => ({ browserTimeZone: () => viewer.timeZone }));

beforeEach(() => {
  vi.mocked(track).mockReset();
  viewer.timeZone = "Europe/Berlin";
});

const today = "2026-10-06";

const USUAL = { startTime: "19:00", lengthMinutes: 240 } as const;

const scheduled = (...dates: string[]) =>
  dates.map((date) => ({ date, state: "scheduled" as const, ...USUAL }));
const thursday: PlayingGroup = {
  groupId: "group-thursday" as Id<"groups">,
  name: "Thursday Crew",
  shareToken: "thursdayTk",
  playerId: "player-robin" as Id<"players">,
  playerName: "Robin",
  timeZone: "Europe/Berlin",
  upcomingSessions: [
    { date: "2026-10-08", state: "scheduled", ...USUAL, location: "Max's place" },
    ...scheduled("2026-10-22"),
  ],
  openDates: 12,
};

const sunday: PlayingGroup = {
  groupId: "group-sunday" as Id<"groups">,
  name: "Sunday Saga",
  shareToken: "sundaySaga",
  playerId: "player-rob" as Id<"players">,
  playerName: "Rob",
  timeZone: "Europe/Berlin",
  upcomingSessions: [],
  openDates: 0,
};

const ownTable: RunningGroup = {
  groupId: "group-own" as Id<"groups">,
  name: "Dragon Heist",
  timeZone: "Europe/Berlin",
  upcomingSessions: [{ date: "2026-10-10", state: "scheduled", ...USUAL, startTime: "18:30" }],
};

const everything: MyGroupsData = { running: [ownTable], playing: [thursday, sunday] };

const feedUrl = "https://next-session.link/cal/a/feedTokenFeedTokenAb.ics";

function renderMyGroups(props: Partial<ComponentProps<typeof MyGroups>> = {}) {
  const handlers = {
    onCreate: vi.fn(),
    onRemove: vi.fn(),
    onLogOut: vi.fn(),
    calendarFeed: {
      subscribe: vi.fn(() => Promise.resolve(feedUrl)),
      reset: vi.fn(() => Promise.resolve(feedUrl)),
    },
  };
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
  it("lists when and where the next Sessions are across Groups, each with its Group", async () => {
    renderMyGroups();

    await screen.findByRole("heading", { level: 1, name: "My groups" });
    const sessions = within(section("Next sessions")).getAllByRole("link");
    expect(sessions.map((link) => link.textContent)).toEqual([
      "Thursday, October 8in 2 days · 19:00–23:00Max's placeThursday Crew",
      "Saturday, October 10in 4 days · 18:30–22:30Dragon Heist",
      "Thursday, October 22in 16 days · 19:00–23:00Thursday Crew",
    ]);
    expect(sessions.map((link) => link.getAttribute("href"))).toEqual([
      "/s/thursdayTk",
      "/g/group-own",
      "/s/thursdayTk",
    ]);
  });

  it("names a Group's zone when the browser is elsewhere", async () => {
    viewer.timeZone = "America/New_York";
    renderMyGroups({ groups: { running: [ownTable], playing: [] } });

    await screen.findByRole("heading", { level: 1, name: "My groups" });
    expect(within(section("Next sessions")).getByRole("link").textContent).toBe(
      "Saturday, October 10in 4 days · 18:30–22:30 Berlin timeDragon Heist",
    );
  });

  it("marks a Cancelled Session in Next sessions and on its Group's card", async () => {
    const cancelledThursday = {
      ...thursday,
      upcomingSessions: [
        { date: "2026-10-08", state: "cancelled" as const, ...USUAL },
        ...scheduled("2026-10-22"),
      ],
    };
    renderMyGroups({ groups: { running: [], playing: [cancelledThursday] } });

    await screen.findByRole("heading", { level: 1, name: "My groups" });
    const sessions = within(section("Next sessions")).getAllByRole("link");
    expect(sessions.map((link) => link.textContent)).toEqual([
      "Thursday, October 8Cancelled · in 2 daysThursday Crew",
      "Thursday, October 22in 16 days · 19:00–23:00Thursday Crew",
    ]);
    expect(sessions.map((link) => link.getAttribute("href"))).toEqual([
      "/s/thursdayTk",
      "/s/thursdayTk",
    ]);
    expect(within(section("You play in")).getByRole("link").textContent).toBe(
      "Thursday Crewas RobinNext session Thu, Oct 8 · Cancelled12 days to answer",
    );
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

    const button = await screen.findByRole("button", { name: "Making your link…" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("names the Account and lets it log out", async () => {
    const { onLogOut } = renderMyGroups();

    const header = await screen.findByRole("banner");
    expect(within(header).getByText("robin@example.test")).toBeTruthy();
    await userEvent.click(within(header).getByRole("button", { name: "Log out" }));

    expect(onLogOut).toHaveBeenCalledOnce();
  });

  it("shows the Account's picture next to its email", async () => {
    renderMyGroups({ image: "https://files.example.test/robin.png" });

    const header = await screen.findByRole("banner");
    expect(header.querySelector("img")?.getAttribute("src")).toBe(
      "https://files.example.test/robin.png",
    );
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

describe("Your calendar on My groups", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("subscribes on the press only, then offers the link to copy and to open in a calendar app", async () => {
    const { calendarFeed } = renderMyGroups();

    const block = await screen.findByRole("region", { name: "Your calendar" });
    expect(calendarFeed.subscribe).not.toHaveBeenCalled();
    await userEvent.click(
      within(block).getByRole("button", { name: "Subscribe in your calendar app" }),
    );

    expect(calendarFeed.subscribe).toHaveBeenCalledOnce();
    expect(
      await within(block).findByRole("textbox", { name: "Calendar feed link" }),
    ).toHaveProperty("value", feedUrl);
    expect(within(block).getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(within(block).getByText(/Other calendars → From URL/)).toBeTruthy();
    expect(
      within(block).getByRole("link", { name: "Open in calendar app" }).getAttribute("href"),
    ).toBe("webcal://next-session.link/cal/a/feedTokenFeedTokenAb.ics");
  });

  it("moves focus to the new link after a keyboard press, so the next step is copying it", async () => {
    renderMyGroups();
    const block = await screen.findByRole("region", { name: "Your calendar" });
    within(block).getByRole("button", { name: "Subscribe in your calendar app" }).focus();

    await userEvent.keyboard("{Enter}");

    const link = await within(block).findByRole("textbox", { name: "Calendar feed link" });
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it("moves focus to the new link after a keyboard reset", async () => {
    const { calendarFeed } = renderMyGroups();
    calendarFeed.reset.mockResolvedValueOnce(
      "https://next-session.link/cal/a/newTokenNewTokenNewTo.ics",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Subscribe in your calendar app" }),
    );
    (await screen.findByRole("button", { name: "Reset feed link" })).focus();

    await userEvent.keyboard("{Enter}");

    const link = await screen.findByDisplayValue(
      "https://next-session.link/cal/a/newTokenNewTokenNewTo.ics",
    );
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it("resets the link at once and shows the new one", async () => {
    const newFeedUrl = "https://next-session.link/cal/a/newTokenNewTokenNewTo.ics";
    const { calendarFeed } = renderMyGroups();
    calendarFeed.reset.mockResolvedValueOnce(newFeedUrl);
    await userEvent.click(
      await screen.findByRole("button", { name: "Subscribe in your calendar app" }),
    );
    const block = screen.getByRole("region", { name: "Your calendar" });
    expect(within(block).getByText("Stops the old link at once.")).toBeTruthy();

    await userEvent.click(await within(block).findByRole("button", { name: "Reset feed link" }));

    expect(calendarFeed.reset).toHaveBeenCalledOnce();
    expect(await within(block).findByDisplayValue(newFeedUrl)).toBeTruthy();
    expect(
      within(block).getByRole("link", { name: "Open in calendar app" }).getAttribute("href"),
    ).toBe("webcal://next-session.link/cal/a/newTokenNewTokenNewTo.ics");
  });

  it("copies the link and counts the copy", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderMyGroups();

    await userEvent.click(
      await screen.findByRole("button", { name: "Subscribe in your calendar app" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(feedUrl);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(track).toHaveBeenCalledExactlyOnceWith({
      name: "calendar_feed_copied",
      method: "clipboard",
    });
  });

  it("says to wait an hour when the Account made too many new links, and keeps the old one shown", async () => {
    const { calendarFeed } = renderMyGroups();
    calendarFeed.reset.mockRejectedValueOnce(new ConvexError({ code: "RATE_LIMITED" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Subscribe in your calendar app" }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Reset feed link" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many new links this hour. Try again in an hour.",
    );
    expect(screen.getByRole("textbox", { name: "Calendar feed link" })).toHaveProperty(
      "value",
      feedUrl,
    );
  });

  it("is not offered to an Account with no Groups", async () => {
    renderMyGroups({ groups: { running: [], playing: [] } });

    await screen.findByText("Open your GM's link and tap Keep this group.");
    expect(screen.queryByRole("region", { name: "Your calendar" })).toBeNull();
  });
});

describe("MyGroups telemetry", () => {
  it.each([
    ["for a Player who runs nothing", { running: [], playing: [thursday] }],
    ["empty", { running: [], playing: [] }],
  ])("tracks Create your link on /me %s", async (_, groups) => {
    const { onCreate } = renderMyGroups({ groups });

    await userEvent.click(await screen.findByRole("button", { name: "Create your link" }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledExactlyOnceWith({ name: "create_link_started", surface: "me" });
  });
});
