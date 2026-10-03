import { describe, expect, it } from "vitest";
import { humanDate } from "./humanDate";

describe("humanDate", () => {
  it("formats an ISO date for people", () => {
    expect(humanDate("2026-10-03")).toBe("Oct 3, 2026");
  });

  it("shows a date it cannot parse as written instead of crashing the page", () => {
    expect(humanDate("date pending")).toBe("date pending");
  });
});
