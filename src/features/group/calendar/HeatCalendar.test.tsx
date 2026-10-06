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

type CalendarSetup = {
  month?: string;
  loadedMonth?: string;
  players?: { _id: string; name: string }[];
  answers?: { playerId: string; date: string; answer: Answer }[];
  sessions?: CalendarSession[];
  selectedDay?: string | null;
};

function renderCalendar({
  month = "2026-10",
  loadedMonth = month,
  players = rosterOf(3),
  answers = [],
  sessions = [],
  selectedDay = null,
}: CalendarSetup = {}) {
  const onSelectDay = vi.fn();
  const onMonthChange = vi.fn();
  const summary = summarizeMonth({ month: loadedMonth, today, players, answers, sessions });
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

function countsOf(day: HTMLElement) {
  return Object.fromEntries(
    [...day.querySelectorAll("[data-count]")].map((count) => [
      count.getAttribute("data-count") ?? "",
      count.textContent,
    ]),
  );
}

function barsOf(day: HTMLElement) {
  return [...day.querySelectorAll("[data-bar]")].map((bar) => bar.getAttribute("data-bar"));
}

describe("HeatCalendar", () => {
  it("steps from the requested month and holds the old grid while the next month loads", async () => {
    const { onMonthChange } = renderCalendar({ month: "2026-11", loadedMonth: "2026-10" });
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    const grid = screen.getByRole("button", { name: /^Friday, October 16:/ }).parentElement!;
    expect(grid.getAttribute("aria-busy")).toBe("true");
    expect(grid.hasAttribute("inert")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-12");
  });

  it("shows a loaded grid as settled", () => {
    renderCalendar();
    const grid = screen.getByRole("button", { name: /^Friday, October 16:/ }).parentElement!;
    expect(grid.hasAttribute("aria-busy")).toBe(false);
    expect(grid.hasAttribute("inert")).toBe(false);
  });

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

  it("marks today as the current date", () => {
    renderCalendar();
    const today = screen.getByRole("button", { name: /^Friday, October 2:/ });
    expect(today.getAttribute("aria-current")).toBe("date");
    expect(
      screen.getByRole("button", { name: /^Saturday, October 3:/ }).hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("colours each Player's bar by their answer and tints a day by its free share", () => {
    renderCalendar({
      answers: [
        { playerId: "p0", date: "2026-10-16", answer: "free" },
        { playerId: "p1", date: "2026-10-16", answer: "maybe" },
        { playerId: "p0", date: "2026-10-17", answer: "free" },
        { playerId: "p1", date: "2026-10-17", answer: "busy" },
      ],
    });
    const friday = screen.getByRole("button", { name: /^Friday, October 16:/ });
    const saturday = screen.getByRole("button", { name: /^Saturday, October 17:/ });
    expect(barsOf(friday)).toEqual(["free", "maybe", "unanswered"]);
    expect(friday.querySelector('[data-bar="maybe"]')?.classList).toContain("bg-maybe-bar");
    expect(friday.style.background).toContain("color-mix(in oklab, var(--free) 18%");
    expect(saturday.style.background).toBe("");
  });

  it("draws a grey bar for each Player who hasn't answered a bookable day", () => {
    renderCalendar({
      answers: [
        { playerId: "p0", date: "2026-10-01", answer: "free" },
        { playerId: "p0", date: "2026-10-16", answer: "free" },
      ],
    });
    const bookable = screen.getByRole("button", {
      name: "Friday, October 16: 1 free, 0 maybe, 0 busy, 2 not answered",
    });
    const past = screen.getByRole("button", {
      name: "Thursday, October 1: 1 free, 0 maybe, 0 busy",
    });
    expect(barsOf(bookable)).toEqual(["free", "unanswered", "unanswered"]);
    expect(barsOf(past)).toEqual(["free"]);
    expect(screen.getByText("not answered")).toBeTruthy();
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

  it("stops at the last month of the Booking Window and keeps the button focusable", async () => {
    const { onMonthChange } = renderCalendar({ month: "2026-12" });
    const next = screen.getByRole("button", { name: "Next month" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    next.focus();
    await userEvent.click(next);
    expect(onMonthChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
  });

  it("draws one bar per Player up to eight Players", () => {
    renderCalendar({ players: rosterOf(8) });
    const day = screen.getByRole("button", { name: /^Friday, October 16:/ });
    expect(day.querySelectorAll("[data-bar]")).toHaveLength(8);
    expect(screen.getByText("one bar per player")).toBeTruthy();
  });

  it("switches to free, busy and not-answered counts above eight Players", () => {
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
    const day = screen.getByRole("button", {
      name: "Friday, October 16: 7 free, 0 maybe, 2 busy, 3 not answered",
    });
    expect(day.querySelectorAll("[data-bar]")).toHaveLength(0);
    expect(countsOf(day)).toEqual({ free: "7/12", busy: "✕2", unanswered: "3" });
    expect(screen.getByText("free of all · busy")).toBeTruthy();
    expect(screen.getByText("not answered")).toBeTruthy();
  });

  it("counts no one as missing on a dense past day or a day everyone answered", () => {
    const players = rosterOf(9);
    renderCalendar({
      players,
      answers: players.map((p) => ({ playerId: p._id, date: "2026-10-17", answer: "maybe" })),
    });
    const past = screen.getByRole("button", { name: /^Thursday, October 1:/ });
    const answered = screen.getByRole("button", { name: /^Saturday, October 17:/ });
    expect(countsOf(past)).toEqual({ free: "0/9" });
    expect(countsOf(answered)).toEqual({ free: "0/9" });
  });

  it("shows no bars or counts for a Group without Players", () => {
    renderCalendar({ players: [] });
    const day = screen.getByRole("button", { name: "Friday, October 16" });
    expect(day.querySelectorAll("[data-bar]")).toHaveLength(0);
    expect(day.textContent).toBe("16");
  });
});
