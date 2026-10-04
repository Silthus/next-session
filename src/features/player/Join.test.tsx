import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useState, type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { Join } from "./Join";

const ana = { _id: "player-ana" as Id<"players">, name: "Ana" };
const ben = { _id: "player-ben" as Id<"players">, name: "Ben" };
const chiara = { _id: "player-chiara" as Id<"players">, name: "Chiara" };
const zoe = { _id: "player-zoe" as Id<"players">, name: "Zoë Ölund" };

function longRoster() {
  const extras = Array.from({ length: 10 }, (_, index) => ({
    _id: `player-${String(index)}` as Id<"players">,
    name: `Guest ${String(index + 1)}`,
  }));
  return [ana, ben, chiara, zoe, ...extras];
}

function renderJoin(props: Partial<ComponentProps<typeof Join>> = {}) {
  const handlers = { onPick: vi.fn(), onJoin: vi.fn(() => Promise.resolve()) };
  renderInRouter(() => (
    <Join groupName="Thursday Crew" players={[chiara, ana, ben]} {...handlers} {...props} />
  ));
  return handlers;
}

function renderInRouter(component: () => ReactNode) {
  const rootRoute = createRootRoute({ component });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("Join", () => {
  it("invites the player to the Group and lists the Roster alphabetically", async () => {
    renderJoin();

    expect(await screen.findByRole("heading", { level: 1, name: "Thursday Crew" })).toBeTruthy();
    expect(screen.getByText("You're invited to")).toBeTruthy();
    const chips = screen.getAllByRole("button", { name: /^(Ana|Ben|Chiara)$/ });
    expect(chips.map((chip) => chip.textContent)).toEqual(["ANAna", "BEBen", "CHChiara"]);
    expect(screen.getByRole("link", { name: "Create your link" })).toHaveProperty("pathname", "/");
  });

  it("answers as a listed Player with one tap", async () => {
    const { onPick } = renderJoin();

    await userEvent.click(await screen.findByRole("button", { name: "Ben" }));

    expect(onPick).toHaveBeenCalledWith(ben);
  });

  it("joins with a typed name and keeps Join disabled while it is blank", async () => {
    const { onJoin } = renderJoin();
    const join = await screen.findByRole("button", { name: "Join" });
    const field = screen.getByRole("textbox", { name: "Not listed? Your name" });

    await userEvent.type(field, "   ");
    expect(join).toHaveProperty("disabled", true);

    await userEvent.type(field, "Dev{Enter}");

    expect(onJoin).toHaveBeenCalledWith("   Dev");
  });

  it("keeps the chips out of reach while a join is on its way", async () => {
    const { onPick } = renderJoin({ onJoin: () => new Promise(() => {}) });

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Not listed? Your name" }),
      "Dev{Enter}",
    );

    expect(screen.getByRole("button", { name: "Joining…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Ben" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Ben" }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("moves focus to the Group name so screen readers start there", async () => {
    renderJoin();

    expect(await screen.findByRole("heading", { level: 1, name: "Thursday Crew" })).toBe(
      document.activeElement,
    );
  });

  it("asks for a name with the field alone when the Roster is empty", async () => {
    renderJoin({ players: [] });

    expect(await screen.findByRole("textbox", { name: "Your name" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("highlights the existing chip when the name is taken", async () => {
    renderJoin({
      onJoin: () => Promise.reject(new ConvexError({ code: "NAME_TAKEN", playerId: ana._id })),
    });

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Not listed? Your name" }),
      "ana{Enter}",
    );

    expect(
      await screen.findByText("That name exists. Tap it, or add a last initial."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ana" }).getAttribute("aria-describedby")).toBe(
      screen.getByText("That name exists. Tap it, or add a last initial.").id,
    );
  });

  it.each([
    [{ code: "RATE_LIMITED", retryAfter: 1000 }, "Slow down a moment, then try again."],
    [{ code: "ROSTER_FULL" }, "This group is full. Ask your GM to make room."],
    [{ code: "INVALID_NAME" }, "Use a name of up to 60 characters."],
  ])("explains a %o refusal", async (data, copy) => {
    renderJoin({ onJoin: () => Promise.reject(new ConvexError(data)) });

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Not listed? Your name" }),
      "Dev{Enter}",
    );

    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join" })).toHaveProperty("disabled", false);
  });

  it("tells a removed Player their name is gone", async () => {
    renderJoin({ removed: true });

    expect(
      await screen.findByText("Your name is no longer on the list. Pick or add one."),
    ).toBeTruthy();
  });

  describe("with a long Roster", () => {
    it("lists twelve names as chips without a filter", async () => {
      renderJoin({ players: longRoster().slice(0, 12) });

      expect(await screen.findAllByRole("listitem")).toHaveLength(12);
      expect(screen.queryByRole("searchbox", { name: "Find your name" })).toBeNull();
    });

    it("narrows the chips as the Player types, ignoring case and accents", async () => {
      renderJoin({ players: longRoster() });
      const filter = await screen.findByRole("searchbox", { name: "Find your name" });
      expect(screen.getAllByRole("listitem")).toHaveLength(14);

      await userEvent.type(filter, "ZOE OL");

      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Zoë Ölund" })).toBeTruthy();
    });

    it("answers as the one name left after filtering", async () => {
      const { onPick } = renderJoin({ players: longRoster() });

      await userEvent.type(await screen.findByRole("searchbox", { name: "Find your name" }), "be");
      await userEvent.click(screen.getByRole("button", { name: "Ben" }));

      expect(onPick).toHaveBeenCalledWith(ben);
    });

    it("closes the keyboard on Enter in the filter without joining", async () => {
      const { onJoin, onPick } = renderJoin({ players: longRoster() });
      const filter = await screen.findByRole("searchbox", { name: "Find your name" });

      await userEvent.type(filter, "Ben{Enter}");

      expect(filter).not.toBe(document.activeElement);
      expect(onJoin).not.toHaveBeenCalled();
      expect(onPick).not.toHaveBeenCalled();
    });

    it("announces when no name matches and still lets the Player join", async () => {
      const { onJoin } = renderJoin({ players: longRoster() });
      const filter = await screen.findByRole("searchbox", { name: "Find your name" });
      const announcement = screen.getByRole("status");
      expect(announcement.textContent).toBe("");

      await userEvent.type(filter, "Dev");

      expect(screen.queryAllByRole("listitem")).toHaveLength(0);
      expect(announcement.textContent).toBe("No names match. Add yours below.");

      await userEvent.type(
        screen.getByRole("textbox", { name: "Not listed? Your name" }),
        "Dev{Enter}",
      );
      expect(onJoin).toHaveBeenCalledWith("Dev");
    });

    it("keeps a taken name's chip in view while the filter hides it", async () => {
      renderJoin({
        players: longRoster(),
        onJoin: () => Promise.reject(new ConvexError({ code: "NAME_TAKEN", playerId: ana._id })),
      });

      await userEvent.type(await screen.findByRole("searchbox", { name: "Find your name" }), "zo");
      await userEvent.type(
        screen.getByRole("textbox", { name: "Not listed? Your name" }),
        "ana{Enter}",
      );

      expect(await screen.findByRole("button", { name: "Ana" })).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("matches letters with a stroke by their plain spelling", async () => {
      const soren = { _id: "player-soren" as Id<"players">, name: "Søren Łukasz" };
      renderJoin({ players: [...longRoster(), soren] });

      await userEvent.type(
        await screen.findByRole("searchbox", { name: "Find your name" }),
        "soren luk",
      );

      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Søren Łukasz" })).toBeTruthy();
    });

    it("shows every chip again once the Roster shrinks to twelve names", async () => {
      let shrinkRoster = () => {};
      function ShrinkingRoster() {
        const [players, setPlayers] = useState(longRoster().slice(0, 13));
        shrinkRoster = () => setPlayers((current) => current.slice(0, 12));
        return (
          <Join groupName="Thursday Crew" players={players} onPick={vi.fn()} onJoin={vi.fn()} />
        );
      }
      renderInRouter(() => <ShrinkingRoster />);
      await userEvent.type(await screen.findByRole("searchbox", { name: "Find your name" }), "zo");

      act(() => shrinkRoster());

      expect(screen.queryByRole("searchbox", { name: "Find your name" })).toBeNull();
      expect(screen.getAllByRole("listitem")).toHaveLength(12);
    });
  });
});
