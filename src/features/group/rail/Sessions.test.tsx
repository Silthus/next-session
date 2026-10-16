import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CalendarSession } from "../calendar/DayCell";
import { sessionOn, today } from "./railFixtures";
import { Sessions } from "./Sessions";

function renderSessions(dates: string[], cancelled: string[] = []) {
  const onSelectDay = vi.fn();
  const sessions: CalendarSession[] = [
    ...dates.map((date) => sessionOn(date, "scheduled")),
    ...cancelled.map((date) => sessionOn(date, "cancelled")),
  ];
  render(<Sessions sessions={sessions} today={today} onSelectDay={onSelectDay} />);
  return { onSelectDay, card: screen.getByRole("region", { name: "Sessions" }) };
}

describe("Sessions", () => {
  it("lists upcoming Sessions soonest first with how far away they are", () => {
    const { card } = renderSessions(["2026-11-20", "2026-10-02", "2026-10-16"]);
    const upcoming = within(card).getAllByRole("button", { name: /day,/ });
    expect(upcoming.map((row) => row.textContent)).toEqual([
      "Friday, October 2today",
      "Friday, October 16in 14 days",
      "Friday, November 20in 49 days",
    ]);
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
