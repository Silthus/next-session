import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CalendarSession } from "../calendar/DayCell";
import { sessionOn, today } from "./railFixtures";
import { Sessions, type SessionsTimeAndPlace } from "./Sessions";

vi.mock("../../../lib/timeZone", () => ({ browserTimeZone: () => "Europe/Berlin" }));

const usualNight: SessionsTimeAndPlace = {
  startTime: "19:00",
  lengthMinutes: 240,
  timeZone: "Europe/Berlin",
  saved: true,
};

function renderSessions(
  dates: string[],
  cancelled: string[] = [],
  timeAndPlace: SessionsTimeAndPlace = usualNight,
) {
  const onSelectDay = vi.fn();
  const onOpenTimeAndPlace = vi.fn();
  const sessions: CalendarSession[] = [
    ...dates.map((date) => sessionOn(date, "scheduled")),
    ...cancelled.map((date) => sessionOn(date, "cancelled")),
  ];
  render(
    <Sessions
      sessions={sessions}
      today={today}
      timeAndPlace={timeAndPlace}
      onSelectDay={onSelectDay}
      onOpenTimeAndPlace={onOpenTimeAndPlace}
    />,
  );
  return {
    onSelectDay,
    onOpenTimeAndPlace,
    card: screen.getByRole("region", { name: "Sessions" }),
  };
}

describe("Sessions", () => {
  it("lists upcoming Sessions soonest first with how far away they are and their time", () => {
    const { card } = renderSessions(["2026-11-20", "2026-10-02", "2026-10-16"]);
    const upcoming = within(card).getAllByRole("button", { name: /day,/ });
    expect(upcoming.map((row) => row.textContent)).toEqual([
      "Friday, October 2today · 19:00–23:00",
      "Friday, October 16in 14 days · 19:00–23:00",
      "Friday, November 20in 49 days · 19:00–23:00",
    ]);
  });

  it("asks when and where the Group plays until the GM saves it once", async () => {
    const { card, onOpenTimeAndPlace } = renderSessions(["2026-10-16"], [], {
      ...usualNight,
      saved: false,
    });
    expect(within(card).getByText("When and where do you play?")).toBeTruthy();
    expect(
      within(card).getByText("Calendars show 19:00 to 23:00 until you change it."),
    ).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /^Edit/ })).toBeNull();

    await userEvent.click(within(card).getByRole("button", { name: "Set time and place" }));
    expect(onOpenTimeAndPlace).toHaveBeenCalledOnce();
  });

  it("sums up the saved time and place in one line with Edit", async () => {
    const { card, onOpenTimeAndPlace } = renderSessions([], [], {
      ...usualNight,
      startTime: "18:30",
      lengthMinutes: 180,
      location: "Max's place",
    });
    expect(within(card).queryByText("When and where do you play?")).toBeNull();
    const edit = within(card).getByRole("button", { name: /^Edit time and place/ });
    expect(edit.textContent).toBe("18:30–21:30 · Max's placeEdit");

    await userEvent.click(edit);
    expect(onOpenTimeAndPlace).toHaveBeenCalledOnce();
  });

  it("names the Group's zone when the GM's browser is elsewhere", () => {
    const { card } = renderSessions(["2026-10-16"], [], {
      ...usualNight,
      timeZone: "Europe/London",
    });
    expect(within(card).getByRole("button", { name: /^Edit time and place/ }).textContent).toBe(
      "19:00–23:00 London timeEdit",
    );
    expect(within(card).getByRole("button", { name: /October 16/ }).textContent).toBe(
      "Friday, October 16in 14 days · 19:00–23:00 London time",
    );
  });

  it.each([
    [["2026-10-02", "2026-10-16"], "Next today"],
    [["2026-11-20", "2026-10-16"], "Next in 14 days"],
  ])("says when the next Session is", (dates, status) => {
    const { card } = renderSessions(dates);
    expect(within(card).getByText(status)).toBeTruthy();
  });

  it("selects a Session's day", async () => {
    const { onSelectDay } = renderSessions(["2026-11-20"]);
    await userEvent.click(screen.getByRole("button", { name: /November 20/ }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-11-20");
  });

  it("folds played Sessions away, latest first", async () => {
    const { card } = renderSessions(["2026-09-04", "2026-09-25", "2026-10-16"]);
    const played = within(card).getByRole("button", { name: "2 played" });
    expect(played.getAttribute("aria-expanded")).toBe("false");
    expect(within(card).queryByText("Friday, Sep 25")).toBeNull();

    await userEvent.click(played);
    expect(played.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(card)
        .getAllByRole("listitem")
        .slice(1)
        .map((item) => item.textContent),
    ).toEqual(["Friday, Sep 25", "Friday, Sep 4"]);
  });

  it("leaves Cancelled Sessions out of both upcoming and played", async () => {
    const { card } = renderSessions(["2026-09-04", "2026-10-16"], ["2026-09-25", "2026-10-09"]);
    expect(within(card).getAllByRole("button", { name: /day,/ })).toHaveLength(1);
    expect(within(card).getByText("Next in 14 days")).toBeTruthy();
    await userEvent.click(within(card).getByRole("button", { name: "1 played" }));
    expect(within(card).getAllByRole("listitem").at(-1)?.textContent).toBe("Friday, Sep 4");
  });

  it("explains that nothing is scheduled", () => {
    const { card } = renderSessions(["2026-09-04"]);
    expect(
      within(card).getByText(
        "Nothing scheduled. Pick a night from the calendar or the best nights.",
      ),
    ).toBeTruthy();
    expect(within(card).getByRole("button", { name: "1 played" })).toBeTruthy();
  });
});
