import { fireEvent, render, screen, within } from "@testing-library/react";
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
  sessionTime?: Partial<
    Pick<CalendarSession, "startTime" | "lengthMinutes" | "location" | "overrides">
  > & { startTime?: ClockTime };
  onSaveDetails?: () => Promise<void>;
};

function renderPanel({
  date = "2026-10-16",
  answers = {},
  session,
  pending = false,
  roster = players,
  timeAndPlace = { startTime: "19:00", lengthMinutes: 240, timeZone: "Europe/Berlin" },
  sessionTime,
  onSaveDetails = () => Promise.resolve(),
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
            overrides: [],
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
    onSaveDetails: vi.fn(onSaveDetails),
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

  it.each([
    ["a scheduled Session", { session: "scheduled" as const }],
    ["a Cancelled Session", { session: "cancelled" as const }],
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

describe("DayPanel when and where of a Session", () => {
  const OWN_NIGHT = {
    startTime: "20:00",
    lengthMinutes: 240,
    location: "The club",
    overrides: ["startTime", "location"],
  } satisfies PanelSetup["sessionTime"];

  const USUAL_AT_MAX = {
    startTime: "19:00",
    lengthMinutes: 240,
    timeZone: "Europe/Berlin",
    location: "Max's place",
  };

  function whenAndWhere() {
    return screen.getByRole("group", { name: "When and where" });
  }

  function fieldRow(name: string) {
    return screen.getByRole("group", { name });
  }

  function startTimeField() {
    return within(fieldRow("Starts at")).getByDisplayValue<HTMLInputElement>(/^\d\d:\d\d$/);
  }

  it("shows the Session's range and place, marked as only this night", () => {
    renderPanel({ session: "scheduled", sessionTime: OWN_NIGHT });

    expect(within(whenAndWhere()).getByText("20:00–00:00 · The club")).toBeTruthy();
    expect(within(whenAndWhere()).getByText("Only this night")).toBeTruthy();
  });

  it("leaves the mark off a Session that follows the Group", () => {
    renderPanel({
      session: "scheduled",
      timeAndPlace: USUAL_AT_MAX,
      sessionTime: { location: "Max's place" },
    });

    expect(within(whenAndWhere()).getByText("19:00–23:00 · Max's place")).toBeTruthy();
    expect(screen.queryByText("Only this night")).toBeNull();
  });

  it("sends exactly the fields the GM changed", async () => {
    const { onSaveDetails } = renderPanel({ session: "scheduled", timeAndPlace: USUAL_AT_MAX });

    await userEvent.click(screen.getByRole("button", { name: "Edit when and where" }));
    fireEvent.change(startTimeField(), { target: { value: "20:30" } });
    await userEvent.click(screen.getByRole("radio", { name: "3 h" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaveDetails).toHaveBeenCalledWith(expect.objectContaining({ _id: "s1" }), {
      startTime: "20:30",
      lengthMinutes: 180,
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("marks each of the Session's own values as only this night in the editor", async () => {
    renderPanel({ session: "scheduled", timeAndPlace: USUAL_AT_MAX, sessionTime: OWN_NIGHT });

    await userEvent.click(screen.getByRole("button", { name: "Edit when and where" }));

    expect(within(fieldRow("Starts at")).getByText("Only this night")).toBeTruthy();
    expect(within(fieldRow("Where")).getByText("Only this night")).toBeTruthy();
    expect(within(fieldRow("Plays for")).queryByText("Only this night")).toBeNull();
    expect(
      within(fieldRow("Plays for")).queryByRole("button", { name: /Use the usual/ }),
    ).toBeNull();
  });

  it("sends null for a field the GM sets back to the usual", async () => {
    const { onSaveDetails } = renderPanel({
      session: "scheduled",
      timeAndPlace: USUAL_AT_MAX,
      sessionTime: OWN_NIGHT,
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit when and where" }));
    await userEvent.click(screen.getByRole("button", { name: "Use the usual start time" }));

    expect(startTimeField().value).toBe("19:00");
    expect(within(fieldRow("Starts at")).queryByText("Only this night")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveDetails).toHaveBeenCalledWith(expect.anything(), { startTime: null });
  });

  it("marks a value the GM changes as only this night", async () => {
    renderPanel({ session: "scheduled", timeAndPlace: USUAL_AT_MAX });

    await userEvent.click(screen.getByRole("button", { name: "Edit when and where" }));
    await userEvent.type(within(fieldRow("Where")).getByRole("textbox"), "!");

    expect(within(fieldRow("Where")).getByText("Only this night")).toBeTruthy();
    expect(
      within(fieldRow("Where")).getByRole("button", { name: "Use the usual place" }),
    ).toBeTruthy();
  });

  it("keeps the editor open with the error when the save fails", async () => {
    renderPanel({
      session: "scheduled",
      onSaveDetails: () => Promise.reject(new Error("offline")),
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit when and where" }));
    fireEvent.change(startTimeField(), { target: { value: "20:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe("That didn't work. Try again.");
    expect(startTimeField().value).toBe("20:30");
  });

  it.each([
    ["a Cancelled Session", { session: "cancelled" as const }],
    ["a past Session", { session: "scheduled" as const, date: "2026-10-01" }],
  ])("shows the values of %s read-only", (_, setup) => {
    renderPanel({ ...setup, sessionTime: OWN_NIGHT });

    expect(within(whenAndWhere()).getByText("20:00–00:00 · The club")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit when and where" })).toBeNull();
  });
});
