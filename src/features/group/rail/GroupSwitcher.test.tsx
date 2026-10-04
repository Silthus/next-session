import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { GroupSwitcher } from "./GroupSwitcher";

const groups = [
  { id: "g1", name: "Thursday Crew", playerCount: 5 },
  { id: "g2", name: "Poker", playerCount: 1 },
];

function renderSwitcher(overrides: Partial<Parameters<typeof GroupSwitcher>[0]> = {}) {
  const props = {
    group: { id: "g1", name: "Thursday Crew" },
    groups,
    onOpen: vi.fn(),
    onCreate: vi.fn(() => Promise.resolve()),
    onRename: vi.fn(() => Promise.resolve()),
    onDelete: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<GroupSwitcher {...props} />);
  return props;
}

const switcher = () => screen.getByRole("button", { name: "Thursday Crew" });
const openMenu = () => userEvent.click(switcher());

describe("GroupSwitcher", () => {
  it("is the page heading and lists every Group with its Players", async () => {
    renderSwitcher();
    expect(screen.getByRole("heading", { level: 1, name: "Thursday Crew" })).toBeTruthy();
    expect(switcher().getAttribute("aria-expanded")).toBe("false");
    await openMenu();
    expect(switcher().getAttribute("aria-expanded")).toBe("true");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Thursday Crew5", "Poker1"]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Poker, 1 player" }).getAttribute("href")).toBe(
      "/g/g2",
    );
  });

  it("opens another Group and closes", async () => {
    const { onOpen } = renderSwitcher();
    await openMenu();
    await userEvent.click(screen.getByRole("link", { name: /^Poker/ }));
    expect(onOpen).toHaveBeenCalledWith("g2");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("makes a new Group", async () => {
    const { onCreate } = renderSwitcher();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("makes one new Group however often the menu is reopened meanwhile", async () => {
    const { onCreate } = renderSwitcher({ onCreate: vi.fn(() => new Promise(() => undefined)) });
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.keyboard("{Escape}");
    await openMenu();
    expect(screen.getByRole("button", { name: "Making your group…" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Making your group…" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("says why a new Group failed", async () => {
    renderSwitcher({
      onCreate: () => Promise.reject(new ConvexError({ code: "TOO_MANY_GROUPS" })),
    });
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "You have 50 groups. Delete one to make room.",
    );
  });

  it("still says why a new Group failed after the menu was closed meanwhile", async () => {
    let fail: (error: unknown) => void = () => undefined;
    renderSwitcher({ onCreate: () => new Promise((_, reject) => (fail = reject)) });
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.keyboard("{Escape}");
    await act(async () => {
      fail(new ConvexError({ code: "RATE_LIMITED", retryAfter: 1000 }));
      await Promise.resolve();
    });
    await openMenu();
    expect(screen.getByRole("alert").textContent).toBe("Slow down a moment, then try again.");
  });

  it("forgets a failure the GM has seen once the menu closes", async () => {
    renderSwitcher({
      onCreate: () => Promise.reject(new ConvexError({ code: "TOO_MANY_GROUPS" })),
    });
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await openMenu();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("holds Delete while a new Group is on its way", async () => {
    renderSwitcher({ onCreate: () => new Promise(() => undefined) });
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Delete group" }));
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    expect(
      screen.getByRole("button", { name: "Delete Thursday Crew" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("renames the Group inline with Enter", async () => {
    const { onRename } = renderSwitcher();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Rename group" }));
    const field = screen.getByRole("textbox", { name: "Group name" });
    expect(document.activeElement).toBe(field);
    await userEvent.clear(field);
    await userEvent.type(field, "  Friday Crew {Enter}");
    expect(onRename).toHaveBeenCalledWith("Friday Crew");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancels a rename with Escape and returns focus to the switcher", async () => {
    const { onRename } = renderSwitcher();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Rename group" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(switcher());
  });

  it("refuses a blank name", async () => {
    const { onRename } = renderSwitcher();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Rename group" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Group name" }));
    await userEvent.keyboard("{Enter}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Use 1 to 60 characters.");
  });

  it("deletes the Group after a confirm that names what is lost", async () => {
    const { onDelete } = renderSwitcher();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Delete group" }));
    const confirm = screen.getByRole("group", { name: "Delete Thursday Crew?" });
    expect(confirm.textContent).toContain(
      "Its 5 players, their answers and its sessions go too, and the player link stops working.",
    );
    await userEvent.click(within(confirm).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete group" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete group" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Thursday Crew" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("stays open when focus drops to the page, and Escape still closes it", async () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    renderSwitcher();
    await openMenu();
    act(() => (document.activeElement as HTMLElement).blur());
    expect(screen.getAllByRole("link")).toHaveLength(2);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("link")).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("offers delete only once it can name what is lost", async () => {
    renderSwitcher({ groups: undefined });
    await openMenu();
    expect(screen.getByRole("button", { name: "Delete group" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("closes the menu with Escape or a click outside", async () => {
    renderSwitcher();
    await openMenu();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.activeElement).toBe(switcher());

    await openMenu();
    await userEvent.click(document.body);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
