import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupRail } from "./GroupRail";

function renderRail({ wide, rosterEmpty = false }: { wide: boolean; rosterEmpty?: boolean }) {
  const onAddPlayer = vi.fn();
  render(
    <GroupRail
      wide={wide}
      rosterEmpty={rosterEmpty}
      onAddPlayer={onAddPlayer}
      calendar={<p>Calendar</p>}
      panels={{
        bestNights: <p>Best nights panel</p>,
        players: <p>Players panel</p>,
        sessions: <p>Sessions panel</p>,
      }}
    />,
  );
  return { onAddPlayer };
}

const visibleText = () => screen.getAllByText(/panel$|^Calendar$/).map((p) => p.textContent);

describe("GroupRail", () => {
  it("flanks the calendar with Players and Best Nights on the left and Sessions on the right on wide screens", () => {
    renderRail({ wide: true });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(visibleText()).toEqual([
      "Players panel",
      "Best nights panel",
      "Calendar",
      "Sessions panel",
    ]);
    const overview = screen.getByRole("complementary", { name: "Group overview" });
    expect(overview.textContent).toBe("Players panelBest nights panel");
  });

  it("shows one panel at a time behind a segmented control on phones", async () => {
    renderRail({ wide: false });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Best nights", "Players", "Sessions"]);
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Best nights");
    expect(screen.getByRole("tabpanel").textContent).toBe("Best nights panel");
    expect(visibleText().slice(0, 1)).toEqual(["Calendar"]);

    await userEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Sessions panel");
    expect(screen.getByRole("tabpanel", { name: "Sessions" })).toBeTruthy();
  });

  it("opens on Players on phones while the Roster is empty", () => {
    renderRail({ wide: false, rosterEmpty: true });
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Players");
    expect(screen.getByRole("tabpanel").textContent).toBe("Players panel");
  });

  it.each(["Best nights", "Players", "Sessions"])(
    "keeps Add player in reach on phones from %s",
    async (tab) => {
      const { onAddPlayer } = renderRail({ wide: false });
      await userEvent.click(screen.getByRole("tab", { name: tab }));
      await userEvent.click(screen.getByRole("button", { name: "Add player" }));
      expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Players");
      expect(screen.getByRole("tabpanel").textContent).toBe("Players panel");
      expect(onAddPlayer).toHaveBeenCalledOnce();
    },
  );

  it("leaves adding to the Players card on wide screens", () => {
    renderRail({ wide: true });
    expect(screen.queryByRole("button", { name: "Add player" })).toBeNull();
  });

  it("keeps each phone panel mounted while another tab shows", async () => {
    renderRail({ wide: false });
    await userEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(screen.getByText("Players panel")).toBeTruthy();
    expect(screen.getByRole("tabpanel").textContent).toBe("Sessions panel");
  });

  it("moves between the phone tabs with the arrow keys", async () => {
    renderRail({ wide: false });
    await userEvent.click(screen.getByRole("tab", { name: "Best nights" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Players panel");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Sessions" }));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Best nights" }));
  });
});
