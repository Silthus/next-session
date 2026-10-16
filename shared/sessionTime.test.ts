import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROUP_TIME,
  endClockTime,
  groupTime,
  isClockTime,
  isLengthMinutes,
  isTimeZone,
  reminderDueAt,
  sessionWindow,
} from "./sessionTime";

const HOUR = 60 * 60 * 1000;
const berlin = DEFAULT_GROUP_TIME;

describe("groupTime", () => {
  it("is 19:00 for 4 hours in Berlin for a Group that never set its time", () => {
    expect(groupTime({})).toEqual({
      startTime: "19:00",
      lengthMinutes: 240,
      timeZone: "Europe/Berlin",
    });
  });

  it("fills each missing value on its own", () => {
    expect(groupTime({ startTime: "18:30" })).toEqual({
      startTime: "18:30",
      lengthMinutes: 240,
      timeZone: "Europe/Berlin",
    });
    expect(groupTime({ lengthMinutes: 180 })).toEqual({
      startTime: "19:00",
      lengthMinutes: 180,
      timeZone: "Europe/Berlin",
    });
    expect(groupTime({ timeZone: "America/New_York" })).toEqual({
      startTime: "19:00",
      lengthMinutes: 240,
      timeZone: "America/New_York",
    });
  });
});

describe("sessionWindow", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("starts at the Group's start time in the Group's zone and lasts its length", () => {
    expect(sessionWindow("2026-11-17", berlin)).toEqual({
      start: Date.UTC(2026, 10, 17, 18, 0),
      end: Date.UTC(2026, 10, 17, 22, 0),
    });
  });

  it("reads the start time on the clock of a Group elsewhere", () => {
    const newYork = groupTime({ startTime: "18:30", timeZone: "America/New_York" });
    expect(sessionWindow("2026-10-16", newYork).start).toBe(Date.UTC(2026, 9, 16, 22, 30));
  });

  it("lets a start-time override replace only the start", () => {
    expect(sessionWindow("2026-11-17", berlin, { startTime: "20:15" })).toEqual({
      start: Date.UTC(2026, 10, 17, 19, 15),
      end: Date.UTC(2026, 10, 17, 23, 15),
    });
  });

  it("lets a length override replace only the length", () => {
    expect(sessionWindow("2026-11-17", berlin, { lengthMinutes: 150 })).toEqual({
      start: Date.UTC(2026, 10, 17, 18, 0),
      end: Date.UTC(2026, 10, 17, 20, 30),
    });
  });

  it("takes both overrides together", () => {
    expect(sessionWindow("2026-11-17", berlin, { startTime: "17:00", lengthMinutes: 360 })).toEqual(
      {
        start: Date.UTC(2026, 10, 17, 16, 0),
        end: Date.UTC(2026, 10, 17, 22, 0),
      },
    );
  });

  it("starts at 19:00 Berlin time on each side of the March change", () => {
    expect(sessionWindow("2026-03-28", berlin).start).toBe(Date.UTC(2026, 2, 28, 18, 0));
    expect(sessionWindow("2026-03-29", berlin).start).toBe(Date.UTC(2026, 2, 29, 17, 0));
  });

  it("starts at 19:00 Berlin time on each side of the October change", () => {
    expect(sessionWindow("2026-10-24", berlin).start).toBe(Date.UTC(2026, 9, 24, 17, 0));
    expect(sessionWindow("2026-10-25", berlin).start).toBe(Date.UTC(2026, 9, 25, 18, 0));
  });

  it("lasts 4 real hours across the October change", () => {
    const window = sessionWindow("2026-10-24", berlin, { startTime: "23:00" });
    expect(window).toEqual({
      start: Date.UTC(2026, 9, 24, 21, 0),
      end: Date.UTC(2026, 9, 25, 1, 0),
    });
    expect(window.end - window.start).toBe(4 * HOUR);
  });

  it("moves a start in the spring-forward gap to the next valid minute", () => {
    expect(sessionWindow("2026-03-29", berlin, { startTime: "02:30" }).start).toBe(
      Date.UTC(2026, 2, 29, 1, 0),
    );
  });

  it("takes the first occurrence of an ambiguous fall-back start", () => {
    expect(sessionWindow("2026-10-25", berlin, { startTime: "02:30" }).start).toBe(
      Date.UTC(2026, 9, 25, 0, 30),
    );
  });
});

describe("reminderDueAt", () => {
  const start = Date.UTC(2026, 10, 17, 18, 0);

  it("is due a day before as 24 hours before the start", () => {
    expect(reminderDueAt(start, "day")).toBe(Date.UTC(2026, 10, 16, 18, 0));
  });

  it("is due 2 hours before the start", () => {
    expect(reminderDueAt(start, "hours")).toBe(Date.UTC(2026, 10, 17, 16, 0));
  });

  it("stays 24 real hours before a Session the night after a clock change", () => {
    const afterOctoberChange = sessionWindow("2026-10-25", berlin).start;
    expect(reminderDueAt(afterOctoberChange, "day")).toBe(Date.UTC(2026, 9, 24, 18, 0));
  });
});

describe("isClockTime", () => {
  it("accepts every minute of the day from 00:00 to 23:59", () => {
    expect(isClockTime("00:00")).toBe(true);
    expect(isClockTime("09:05")).toBe(true);
    expect(isClockTime("23:59")).toBe(true);
  });

  it("refuses times past the end of the day", () => {
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("23:60")).toBe(false);
  });

  it("refuses anything but two-digit hours and minutes", () => {
    expect(isClockTime("9:05")).toBe(false);
    expect(isClockTime("09:5")).toBe(false);
    expect(isClockTime("09:05:00")).toBe(false);
    expect(isClockTime(" 09:05")).toBe(false);
    expect(isClockTime("7pm")).toBe(false);
    expect(isClockTime("")).toBe(false);
  });
});

describe("isTimeZone", () => {
  it("accepts the zones Intl knows", () => {
    expect(isTimeZone("Europe/Berlin")).toBe(true);
    expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
  });

  it("refuses zones Intl doesn't know", () => {
    expect(isTimeZone("Europe/Atlantis")).toBe(false);
    expect(isTimeZone("Berlin")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("isLengthMinutes", () => {
  it("accepts 30 minutes to 12 hours", () => {
    expect(isLengthMinutes(30)).toBe(true);
    expect(isLengthMinutes(240)).toBe(true);
    expect(isLengthMinutes(720)).toBe(true);
  });

  it("refuses lengths outside 30 minutes to 12 hours", () => {
    expect(isLengthMinutes(15)).toBe(false);
    expect(isLengthMinutes(735)).toBe(false);
  });

  it("refuses lengths off the 15-minute step", () => {
    expect(isLengthMinutes(100)).toBe(false);
    expect(isLengthMinutes(240.5)).toBe(false);
    expect(isLengthMinutes(Number.NaN)).toBe(false);
  });
});

describe("endClockTime", () => {
  it("is the start plus the length on the clock", () => {
    expect(endClockTime("19:00", 240)).toBe("23:00");
    expect(endClockTime("18:45", 150)).toBe("21:15");
  });

  it("wraps past midnight", () => {
    expect(endClockTime("22:00", 240)).toBe("02:00");
    expect(endClockTime("23:30", 30)).toBe("00:00");
  });
});
