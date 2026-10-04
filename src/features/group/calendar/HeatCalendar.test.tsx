import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Answer } from "../../../../shared/answers";
import { summarizeMonth } from "../../../../shared/monthSummary";
import type { CalendarSession } from "./DayCell";
import { HeatCalendar } from "./HeatCalendar";

const today = "2026-10-02";

function rosterOf(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `p${String(i)}`,
    name: `Player ${String(i)}`,
  }));
}

function renderCalendar({
  month = "2026-10",
  players = rosterOf(3),
  answers = [] as { playerId: string; date: string; answer: Answer }[],
  sessions = [] as CalendarSession[],
  selectedDay = null as string | null,
} = {}) {
  const onSelectDay = vi.fn();
  const onMonthChange = vi.fn();
  const summary = summarizeMonth({ month, today, players, answers, sessions });
  render(
    <HeatCalendar
      month={month}
      today={today}
      players={players}
      days={summary.days}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
      onMonthChange={onMonthChange}
    />,
  );
  return { onSelectDay, onMonthChange };
}

describe("HeatCalendar", () => {
  it("shows the month and sums up each day for screen readers", () => {
    renderCalendar({
      answers: [
        { playerId: "p0", date: "2026-10-16", answer: "free" },
        { playerId: "p1", date: "2026-10-16", answer: "maybe" },
        { playerId: "p2", date: "2026-10-16", answer: "busy" },
      ],
    });
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Friday, October 16: 1 free, 1 maybe, 1 busy" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^\w+day, October \d+:/ })).toHaveLength(31);
  });

  it("names everyone free and a scheduled Session", () => {
    renderCalendar({
      players: rosterOf(2),
      answers: [
        { playerId: "p0", date: "2026-10-09", answer: "free" },
        { playerId: "p1", date: "2026-10-09", answer: "free" },
      ],
      sessions: [{ _id: "s1" as Id<"sessions">, date: "2026-10-09" }],
    });
    expect(
      screen.getByRole("button", {
        name: "Friday, October 9: everyone free, Session scheduled",
      }),
    ).toBeTruthy();
  });

  it("selects a tapped day", async () => {
    const { onSelectDay } = renderCalendar();
    await userEvent.click(screen.getByRole("button", { name: /^Friday, October 16:/ }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-10-16");
  });

  it("clears the selection when the selected day is tapped again", async () => {
    const { onSelectDay } = renderCalendar({ selectedDay: "2026-10-16" });
    const selected = screen.getByRole("button", { name: /^Friday, October 16:/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(selected);
    expect(onSelectDay).toHaveBeenCalledWith(null);
  });

  it("keeps past days read-only", () => {
    renderCalendar();
    expect(screen.getByRole("button", { name: /^Thursday, October 1:/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: /^Friday, October 2:/ })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("marks a past month and dims every day", () => {
    renderCalendar({ month: "2026-09" });
    expect(screen.getByText("Past month")).toBeTruthy();
    expect(
      screen
        .getAllByRole("button", { name: /^\w+day, September/ })
        .every((day) => day.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("moves between months up to the end of the Booking Window", async () => {
    const { onMonthChange } = renderCalendar();
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-11");
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-09");
  });

  it("stops at the last month of the Booking Window", () => {
    renderCalendar({ month: "2026-12" });
    expect(screen.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);
  });

  it("draws one bar per Player up to eight Players", () => {
    renderCalendar({ players: rosterOf(8) });
    const day = screen.getByRole("button", { name: /^Friday, October 16:/ });
    expect(day.querySelectorAll("[data-bar]")).toHaveLength(8);
    expect(screen.getByText("one bar per player")).toBeTruthy();
  });

  it("switches to free counts and a busy count above eight Players", () => {
    const players = rosterOf(12);
    renderCalendar({
      players,
      answers: [
        ...players
          .slice(0, 7)
          .map((p) => ({ playerId: p._id, date: "2026-10-16", answer: "free" as const })),
        { playerId: "p7", date: "2026-10-16", answer: "busy" },
        { playerId: "p8", date: "2026-10-16", answer: "busy" },
      ],
    });
    const day = screen.getByRole("button", { name: /^Friday, October 16:/ });
    expect(day.querySelectorAll("[data-bar]")).toHaveLength(0);
    expect(day.textContent).toBe("167/12✕2");
    expect(screen.getByText("free of all · busy")).toBeTruthy();
  });

  it("shows no bars or counts for a Group without Players", () => {
    renderCalendar({ players: [] });
    const day = screen.getByRole("button", { name: "Friday, October 16" });
    expect(day.querySelectorAll("[data-bar]")).toHaveLength(0);
    expect(day.textContent).toBe("16");
  });
});
