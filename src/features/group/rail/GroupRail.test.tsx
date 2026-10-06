import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { GroupRail } from "./GroupRail";

function renderRail({
  wide,
  dayPanel = null,
  rosterEmpty = false,
}: {
  wide: boolean;
  dayPanel?: ReactNode;
  rosterEmpty?: boolean;
}) {
  render(
    <GroupRail
      wide={wide}
      rosterEmpty={rosterEmpty}
      shareLink={<p>Share link</p>}
      dayPanel={dayPanel}
      panels={{
        bestNights: <p>Best nights panel</p>,
        players: <p>Players panel</p>,
        sessions: <p>Sessions panel</p>,
      }}
    />,
  );
}

const visibleText = () =>
  screen.getAllByText(/panel$|^Share link$|^Day$/).map((p) => p.textContent);

describe("GroupRail", () => {
  it("stacks the Share Link, the day, Best Nights, Sessions and Players on wide screens", () => {
    renderRail({ wide: true, dayPanel: <p>Day</p> });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(visibleText()).toEqual([
      "Share link",
      "Day",
      "Best nights panel",
      "Sessions panel",
      "Players panel",
    ]);
  });

  it("shows one panel at a time behind a segmented control on phones", async () => {
    renderRail({ wide: false });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Best nights", "Players", "Sessions"]);
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Best nights");
    expect(screen.getByRole("tabpanel").textContent).toBe("Best nights panel");
    expect(screen.queryByText("Share link")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Sessions panel");
    expect(screen.getByRole("tabpanel", { name: "Sessions" })).toBeTruthy();
  });

  it("opens on Players on phones while the Roster is empty", () => {
    renderRail({ wide: false, rosterEmpty: true });
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Players");
    expect(screen.getByRole("tabpanel").textContent).toBe("Players panel");
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
