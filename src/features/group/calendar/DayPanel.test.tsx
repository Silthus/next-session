import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Answer } from "../../../../shared/answers";
import { summarizeMonth } from "../../../../shared/monthSummary";
import type { ClockTime } from "../../../../shared/sessionTime";
import type { CalendarSession } from "./DayCell";
import { DayPanel } from "./DayPanel";

vi.mock("../../../lib/timeZone", () => ({ browserTimeZone: () => "Europe/Berlin" }));

const today = "2026-10-02";
const players = ["Ana", "Ben", "Chiara", "Dev", "Eli"].map((name) => ({ _id: name, name }));

type PanelSetup = {
  date?: string;
  answers?: Record<string, Answer>;
  session?: CalendarSession["state"];
  pending?: boolean;
  roster?: typeof players;
  timeAndPlace?: { startTime: string; lengthMinutes: number; timeZone: string; location?: string };
  sessionTime?: { startTime: ClockTime; lengthMinutes: number };
};

function renderPanel({
  date = "2026-10-16",
  answers = {},
  session,
  pending = false,
  roster = players,
  timeAndPlace = { startTime: "19:00", lengthMinutes: 240, timeZone: "Europe/Berlin" },
  sessionTime,
}: PanelSetup = {}) {
  const summary = summarizeMonth({
    month: date.slice(0, 7),
    today,
    players: roster,
    answers: Object.entries(answers).map(([playerId, answer]) => ({ playerId, date, answer })),
    sessions: session
      ? [
          {
            _id: "s1" as Id<"sessions">,
            date,
            state: session,
            published: true,
            startTime: "19:00" as const,
            lengthMinutes: 240,
            ...sessionTime,
          },
        ]
      : [],
  });
  const day = summary.days.find((d) => d.date === date)!;
  const handlers = {
    onClose: vi.fn(),
    onSchedule: vi.fn(),
    onCancel: vi.fn(),
    onOpenTimeAndPlace: vi.fn(),
  };
  render(
    <DayPanel
      day={day}
      playerCount={roster.length}
      today={today}
      pending={pending}
      timeAndPlace={timeAndPlace}
      closeLabel="Overview"
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

  it("says what players' calendars will show right above Schedule session", async () => {
    const { onSchedule, onOpenTimeAndPlace } = renderPanel({
      timeAndPlace: {
        startTime: "18:30",
        lengthMinutes: 180,
        timeZone: "Europe/Berlin",
        location: "Max's place",
      },
    });
    const line = screen.getByText(/^Players' calendars will show/);
    expect(line.textContent).toBe("Players' calendars will show 18:30–21:30 · Max's place");
    expect(line.closest("div")?.nextElementSibling).toBe(
      screen.getByRole("button", { name: "Schedule session" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Change time and place" }));
    expect(onOpenTimeAndPlace).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Schedule session" }));
    expect(onSchedule).toHaveBeenCalledOnce();
  });

  it("names the Group's zone in the line when the GM's browser is elsewhere", () => {
    renderPanel({
      timeAndPlace: { startTime: "19:00", lengthMinutes: 240, timeZone: "Europe/London" },
    });
    expect(screen.getByText(/^Players' calendars will show/).textContent).toBe(
      "Players' calendars will show 19:00–23:00 London time",
    );
  });

  it("shows the time a Cancelled Session comes back with", () => {
    renderPanel({ session: "cancelled", sessionTime: { startTime: "20:00", lengthMinutes: 120 } });
    expect(screen.getByText(/^Players' calendars will show/).textContent).toBe(
      "Players' calendars will show 20:00–22:00",
    );
  });

  it.each([
    ["a scheduled Session", { session: "scheduled" as const }],
    ["a past night", { date: "2026-10-01" }],
  ])("leaves the line off %s", (_, setup) => {
    renderPanel(setup);
    expect(screen.queryByText(/^Players' calendars will show/)).toBeNull();
  });

  it("cancels a Session that has not passed", async () => {
    const { onCancel } = renderPanel({ session: "scheduled" });
    expect(screen.queryByText("Cancelled")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ _id: "s1" }));
  });

  it("still cancels a Session today", async () => {
    const { onCancel } = renderPanel({ date: today, session: "scheduled" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ _id: "s1", date: today }));
  });

  it("marks a Cancelled Session and schedules it again", async () => {
    const { onSchedule, onCancel } = renderPanel({ session: "cancelled" });
    expect(screen.getByText("Cancelled")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Schedule again" }));
    expect(onSchedule).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps a past Cancelled Session marked and read-only", () => {
    renderPanel({ date: "2026-10-01", session: "cancelled" });
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /schedule|cancel/i })).toBeNull();
    expect(screen.getByText("This night was cancelled. Past dates are read-only.")).toBeTruthy();
  });

  it("offers no cancel on a past Session", () => {
    renderPanel({ date: "2026-10-01", session: "scheduled" });
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

  it("holds the button, and its focus, while the change is on its way", async () => {
    const { onSchedule } = renderPanel({ pending: true });
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.focus();
    await userEvent.click(button);
    expect(onSchedule).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
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
