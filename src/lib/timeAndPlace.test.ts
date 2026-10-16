import { describe, expect, it } from "vitest";
import { timeRange, zoneName } from "./timeAndPlace";

const berlinNight = { startTime: "19:00", lengthMinutes: 240, timeZone: "Europe/Berlin" } as const;

describe("timeRange", () => {
  it("shows the start and the wall-clock end in the Group's time", () => {
    expect(timeRange(berlinNight, "Europe/Berlin")).toBe("19:00–23:00");
  });

  it("wraps past midnight", () => {
    expect(
      timeRange({ ...berlinNight, startTime: "21:30", lengthMinutes: 270 }, "Europe/Berlin"),
    ).toBe("21:30–02:00");
  });

  it("names the Group's zone when the viewer is somewhere else", () => {
    expect(timeRange(berlinNight, "America/New_York")).toBe("19:00–23:00 Berlin time");
  });

  it("treats two names for the same zone as the same place", () => {
    expect(timeRange({ ...berlinNight, timeZone: "Asia/Calcutta" }, "Asia/Kolkata")).toBe(
      "19:00–23:00",
    );
  });
});

describe("zoneName", () => {
  it.each([
    ["Europe/Berlin", "Berlin time"],
    ["America/Argentina/Buenos_Aires", "Buenos Aires time"],
    ["UTC", "UTC time"],
  ])("calls %s by its city", (timeZone, name) => {
    expect(zoneName(timeZone)).toBe(name);
  });
});
