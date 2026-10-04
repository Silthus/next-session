import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { Players } from "./Players";
import { monthWith, rosterOf } from "./railFixtures";

function renderPlayers(summary = monthWith({}), handlers: Partial<Handlers> = {}) {
  const all: Handlers = {
    onAdd: vi.fn(() => Promise.resolve()),
    onRename: vi.fn(() => Promise.resolve()),
    onRemove: vi.fn(() => Promise.resolve()),
    ...handlers,
  };
  render(<Players progress={summary.progress} {...all} />);
  return { ...all, card: screen.getByRole("region", { name: /^Players/ }) };
}

type Handlers = {
  onAdd: (name: string) => Promise<unknown>;
  onRename: (playerId: string, name: string) => Promise<unknown>;
  onRemove: (playerId: string) => Promise<unknown>;
};

const takenName = new ConvexError({ code: "NAME_TAKEN", playerId: "Ana" });

describe("Players", () => {
  it("lists each Player with how many nights they answered", () => {
    const { card } = renderPlayers(
      monthWith({
        players: rosterOf("Ana", "Ben"),
        answers: { "2026-10-16": { Ana: "free" }, "2026-10-17": { Ana: "busy" } },
      }),
    );
    expect(within(card).getByRole("heading").textContent).toBe("Players · 2");
    expect(
      within(card)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["ANAna2/30", "BEBen0/30"]);
  });

  it("ticks a Player who answered every night", () => {
    const nights = Array.from(
      { length: 30 },
      (_, i) => `2026-10-${String(i + 2).padStart(2, "0")}`,
    );
    renderPlayers(
      monthWith({
        players: rosterOf("Ana"),
        answers: Object.fromEntries(nights.map((date) => [date, { Ana: "free" }])),
      }),
    );
    expect(screen.getByRole("img", { name: "Answered every night" })).toBeTruthy();
  });

  it("explains self-join on an empty Roster with the add form open", () => {
    const { card } = renderPlayers(monthWith({ players: [] }));
    expect(
      within(card).getByText(
        "Players add themselves when they open your link. You can also add names now.",
      ),
    ).toBeTruthy();
    expect(within(card).getByRole("textbox", { name: "Player name" })).toBeTruthy();
  });

  it("adds a Player and closes the form", async () => {
    const { onAdd, card } = renderPlayers();
    await userEvent.click(within(card).getByRole("button", { name: "Add player" }));
    await userEvent.type(
      within(card).getByRole("textbox", { name: "Player name" }),
      " Fay {Enter}",
    );
    expect(onAdd).toHaveBeenCalledWith("Fay");
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Add player" }));
  });

  it("keeps the name and says why when adding fails", async () => {
    const { card } = renderPlayers(monthWith({}), { onAdd: () => Promise.reject(takenName) });
    await userEvent.click(within(card).getByRole("button", { name: "Add player" }));
    const field = within(card).getByRole("textbox", { name: "Player name" });
    await userEvent.type(field, "Ana{Enter}");
    expect(within(card).getByRole("alert").textContent).toBe("That name is already on the list.");
    expect((field as HTMLInputElement).value).toBe("Ana");
  });

  it("does not add a blank name", async () => {
    const { onAdd, card } = renderPlayers(monthWith({ players: [] }));
    await userEvent.type(within(card).getByRole("textbox", { name: "Player name" }), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(within(card).getByRole("alert").textContent).toBe("Use 1 to 60 characters.");
  });

  it("renames a Player inline, and Escape cancels", async () => {
    const { onRename, card } = renderPlayers(monthWith({ players: rosterOf("Ana", "Ben") }));
    await userEvent.click(within(card).getByRole("button", { name: "More for Ana" }));
    await userEvent.click(within(card).getByRole("button", { name: "Rename" }));
    const field = within(card).getByRole("textbox", { name: "New name for Ana" });
    await userEvent.clear(field);
    await userEvent.type(field, "Anna{Enter}");
    expect(onRename).toHaveBeenCalledWith("Ana", "Anna");
    expect(within(card).queryByRole("textbox")).toBeNull();

    await userEvent.click(within(card).getByRole("button", { name: "More for Ben" }));
    await userEvent.click(within(card).getByRole("button", { name: "Rename" }));
    await userEvent.keyboard("{Escape}");
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(onRename).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "More for Ben" }));
  });

  it("keeps the rename open and says why when it fails", async () => {
    const { card } = renderPlayers(monthWith({ players: rosterOf("Ana", "Ben") }), {
      onRename: () => Promise.reject(takenName),
    });
    await userEvent.click(within(card).getByRole("button", { name: "More for Ben" }));
    await userEvent.click(within(card).getByRole("button", { name: "Rename" }));
    const field = within(card).getByRole("textbox", { name: "New name for Ben" });
    await userEvent.clear(field);
    await userEvent.type(field, "Ana{Enter}");
    expect(within(card).getByRole("alert").textContent).toBe("That name is already on the list.");
  });

  it("asks before removing a Player and their answers", async () => {
    const { onRemove, card } = renderPlayers(monthWith({ players: rosterOf("Ana", "Ben") }));
    await userEvent.click(within(card).getByRole("button", { name: "More for Ana" }));
    await userEvent.click(within(card).getByRole("button", { name: "Remove" }));
    expect(within(card).getByText("Remove Ana? Their answers go too.")).toBeTruthy();
    await userEvent.click(within(card).getByRole("button", { name: "Keep" }));
    expect(onRemove).not.toHaveBeenCalled();

    await userEvent.click(within(card).getByRole("button", { name: "More for Ana" }));
    await userEvent.click(within(card).getByRole("button", { name: "Remove" }));
    await userEvent.click(within(card).getByRole("button", { name: "Remove Ana" }));
    expect(onRemove).toHaveBeenCalledWith("Ana");
  });

  it("closes a Player's menu with Escape", async () => {
    const { card } = renderPlayers(monthWith({ players: rosterOf("Ana") }));
    const more = within(card).getByRole("button", { name: "More for Ana" });
    await userEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
  });
});
