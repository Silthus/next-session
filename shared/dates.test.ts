import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addMonths,
  bookingWindow,
  isBookable,
  isBookableMonth,
  isValidDate,
  isValidMonth,
  monthDays,
  monthOf,
  todayUtc,
} from "./dates";

describe("todayUtc", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("is the UTC calendar date, whatever the local time zone says", () => {
    expect(todayUtc(Date.UTC(2026, 9, 3, 23, 59))).toBe("2026-10-03");
    expect(todayUtc(Date.UTC(2026, 9, 4, 0, 0))).toBe("2026-10-04");
  });
});

describe("monthOf", () => {
  it("is the month a date falls in", () => {
    expect(monthOf("2026-10-03")).toBe("2026-10");
  });
});

describe("addMonths", () => {
  it("moves forward across a year boundary", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
  });

  it("moves backward across a year boundary", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthDays", () => {
  it("lists every date of the month in order", () => {
    const days = monthDays("2026-10");
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-10-01");
    expect(days[30]).toBe("2026-10-31");
  });

  it("knows leap years", () => {
    expect(monthDays("2028-02")).toHaveLength(29);
    expect(monthDays("2026-02")).toHaveLength(28);
  });
});

describe("bookingWindow", () => {
  it("runs from today to the last day of the month two months after the current one", () => {
    expect(bookingWindow("2026-10-03")).toEqual({ first: "2026-10-03", last: "2026-12-31" });
  });

  it("ends in the next year late in the year", () => {
    expect(bookingWindow("2026-12-31")).toEqual({ first: "2026-12-31", last: "2027-02-28" });
  });
});

describe("isBookable", () => {
  const today = "2026-10-03";

  it("accepts today and the last day of the Booking Window", () => {
    expect(isBookable("2026-10-03", today)).toBe(true);
    expect(isBookable("2026-12-31", today)).toBe(true);
  });

  it("rejects past dates, which are read-only", () => {
    expect(isBookable("2026-10-02", today)).toBe(false);
  });

  it("rejects dates after the Booking Window", () => {
    expect(isBookable("2027-01-01", today)).toBe(false);
  });

  it("rejects strings that are not real dates", () => {
    expect(isBookable("2026-11-31", today)).toBe(false);
    expect(isBookable("2026-10-5", today)).toBe(false);
  });
});

describe("isBookableMonth", () => {
  it("accepts the current month and the two after it", () => {
    expect(isBookableMonth("2026-10", "2026-10-31")).toBe(true);
    expect(isBookableMonth("2026-12", "2026-10-31")).toBe(true);
  });

  it("rejects the month before and the month after the Booking Window", () => {
    expect(isBookableMonth("2026-09", "2026-10-03")).toBe(false);
    expect(isBookableMonth("2027-01", "2026-10-03")).toBe(false);
  });

  it("follows the Booking Window into the next year", () => {
    expect(isBookableMonth("2027-02", "2026-12-31")).toBe(true);
    expect(isBookableMonth("2026-02", "2026-12-31")).toBe(false);
  });

  it("rejects strings that are not real months", () => {
    expect(isBookableMonth("2026-13", "2026-10-03")).toBe(false);
    expect(isBookableMonth("2026-1", "2026-10-03")).toBe(false);
  });
});

describe("isValidDate", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
  });

  it("rejects roll-over days, bad months, and other shapes", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-10-00")).toBe(false);
    expect(isValidDate("2026-10-03T00:00")).toBe(false);
  });
});

describe("isValidMonth", () => {
  it("accepts YYYY-MM with a month from 01 to 12", () => {
    expect(isValidMonth("2026-12")).toBe(true);
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-1")).toBe(false);
  });
});
