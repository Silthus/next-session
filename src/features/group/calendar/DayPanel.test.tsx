import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Answer } from "../../../../shared/answers";
import { summarizeMonth } from "../../../../shared/monthSummary";
import { DayPanel } from "./DayPanel";

const today = "2026-10-02";
const players = ["Ana", "Ben", "Chiara", "Dev", "Eli"].map((name) => ({ _id: name, name }));

type PanelSetup = {
  date?: string;
  answers?: Record<string, Answer>;
  scheduled?: boolean;
  pending?: boolean;
  roster?: typeof players;
};

function renderPanel({
  date = "2026-10-16",
  answers = {},
  scheduled = false,
  pending = false,
  roster = players,
}: PanelSetup = {}) {
  const summary = summarizeMonth({
    month: date.slice(0, 7),
    today,
    players: roster,
    answers: Object.entries(answers).map(([playerId, answer]) => ({ playerId, date, answer })),
    sessions: scheduled ? [{ _id: "s1" as Id<"sessions">, date }] : [],
  });
  const day = summary.days.find((d) => d.date === date)!;
  const handlers = { onClose: vi.fn(), onSchedule: vi.fn(), onUnschedule: vi.fn() };
  render(
    <DayPanel
      day={day}
      playerCount={roster.length}
      today={today}
      pending={pending}
      {...handlers}
    />,
  );
  return handlers;
}

describe("DayPanel", () => {
  it("lists who is free first, then maybe, busy and silent", () => {
    renderPanel({ answers: { Eli: "free", Dev: "busy", Ana: "maybe", Ben: "free" } });
    expect(screen.getByRole("heading", { name: "Friday, October 16" })).toBeTruthy();
    expect(screen.getByText("in 14 days")).toBeTruthy();
    expect(screen.getByText("2 free")).toBeTruthy();
    expect(screen.getByText(/1 maybe · 1 busy · 1 silent/)).toBeTruthy();
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toEqual([
      "BEBenFree",
      "ELEliFree",
      "ANAnaMaybe",
      "DEDevBusy",
      "CHChiaraNo answer",
    ]);
  });

  it("schedules a bookable night", async () => {
    const { onSchedule } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Schedule session" }));
    expect(onSchedule).toHaveBeenCalledOnce();
  });

  it("unschedules a Session that has not passed", async () => {
    const { onUnschedule } = renderPanel({ scheduled: true });
    await userEvent.click(screen.getByRole("button", { name: "Unschedule this session" }));
    expect(onUnschedule).toHaveBeenCalledWith(expect.objectContaining({ _id: "s1" }));
  });

  it("still unschedules a Session today", () => {
    renderPanel({ date: today, scheduled: true });
    expect(screen.getByRole("button", { name: "Unschedule this session" })).toBeTruthy();
  });

  it("offers no Unschedule on a past Session", () => {
    renderPanel({ date: "2026-10-01", scheduled: true });
    expect(screen.queryByRole("button", { name: /schedule/i })).toBeNull();
    expect(screen.getByText("You played this night. Past dates are read-only.")).toBeTruthy();
  });

  it("cannot schedule a past night", () => {
    renderPanel({ date: "2026-10-01" });
    expect(screen.getByRole("button", { name: "Schedule session" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("holds the button while the change is on its way", () => {
    renderPanel({ pending: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
  });

  it("goes back to the overview", async () => {
    const { onClose } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("explains an empty Roster", () => {
    renderPanel({ roster: [] });
    const panel = screen.getByRole("region", { name: "Friday, October 16" });
    expect(
      within(panel).getByText("No players yet. They show up here once they open your link."),
    ).toBeTruthy();
    expect(within(panel).queryByRole("list")).toBeNull();
  });
});
