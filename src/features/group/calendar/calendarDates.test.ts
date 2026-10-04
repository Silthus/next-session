import { describe, expect, it } from "vitest";
import {
  dayLabel,
  leadingBlanks,
  longDayLabel,
  monthLabel,
  relativeDay,
  visibleDay,
  visibleMonth,
} from "./calendarDates";

describe("leadingBlanks", () => {
  it("counts the blank cells before the first day of a week that starts on Monday", () => {
    expect(leadingBlanks("2026-10")).toBe(3);
    expect(leadingBlanks("2026-06")).toBe(0);
    expect(leadingBlanks("2026-11")).toBe(6);
  });
});

describe("labels", () => {
  it("names the month with its year", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("names a day short and long, in UTC", () => {
    expect(dayLabel("2026-10-16")).toBe("Fri, Oct 16");
    expect(longDayLabel("2026-10-16")).toBe("Friday, October 16");
  });
});

describe("relativeDay", () => {
  it.each([
    ["2026-10-02", "today"],
    ["2026-10-03", "tomorrow"],
    ["2026-10-16", "in 14 days"],
    ["2026-10-01", "yesterday"],
    ["2026-09-22", "10 days ago"],
  ])("puts %s as %s from Oct 2", (date, expected) => {
    expect(relativeDay(date, "2026-10-02")).toBe(expected);
  });
});

describe("visibleMonth", () => {
  const today = "2026-10-02";

  it("defaults to the current month", () => {
    expect(visibleMonth(undefined, today)).toBe("2026-10");
    expect(visibleMonth("soon", today)).toBe("2026-10");
    expect(visibleMonth("2026-13", today)).toBe("2026-10");
  });

  it("keeps a past month and a month inside the Booking Window", () => {
    expect(visibleMonth("2026-03", today)).toBe("2026-03");
    expect(visibleMonth("2026-12", today)).toBe("2026-12");
  });

  it("holds the GM at the last month of the Booking Window", () => {
    expect(visibleMonth("2027-01", today)).toBe("2026-12");
  });
});

describe("visibleDay", () => {
  it("keeps a valid day of the visible month", () => {
    expect(visibleDay("2026-10-16", "2026-10")).toBe("2026-10-16");
  });

  it("drops a day outside the visible month or a malformed one", () => {
    expect(visibleDay("2026-11-02", "2026-10")).toBeNull();
    expect(visibleDay("2026-10-32", "2026-10")).toBeNull();
    expect(visibleDay(undefined, "2026-10")).toBeNull();
  });
});
