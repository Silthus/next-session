import { describe, expect, it } from "vitest";
import { playerMonth, visibleMonth } from "./playerMonth";

const today = "2026-10-04";

function october(overrides: Partial<Parameters<typeof playerMonth>[0]> = {}) {
  return playerMonth({ month: "2026-10", today, answers: {}, sessionDates: [], ...overrides });
}

describe("visibleMonth", () => {
  it.each([
    [undefined, "2026-10"],
    ["2026-11", "2026-11"],
    ["2026-12", "2026-12"],
    ["2027-01", "2026-10"],
    ["2026-09", "2026-09"],
    ["2026-13", "2026-10"],
    ["soon", "2026-10"],
  ])("shows %s as %s", (requested, shown) => {
    expect(visibleMonth(requested, today)).toBe(shown);
  });
});

describe("playerMonth", () => {
  it("lays out the month from Monday with a label", () => {
    const view = october();

    expect(view.label).toBe("October 2026");
    expect(view.leadingBlanks).toBe(3);
    expect(view.days).toHaveLength(31);
    expect(view.days[0]).toMatchObject({ date: "2026-10-01", dayOfMonth: 1 });
  });

  it("locks the days before today and marks today", () => {
    const view = october();

    expect(view.days.slice(0, 3).every((day) => day.locked)).toBe(true);
    expect(view.days[3]).toMatchObject({ date: today, locked: false, isToday: true });
  });

  it("counts progress over the bookable days only", () => {
    const view = october({
      answers: { "2026-10-01": "free", "2026-10-04": "maybe", "2026-10-05": "busy" },
    });

    expect(view.progress).toEqual({ answered: 2, fillable: 28 });
    expect(view.fillRest).toHaveLength(26);
    expect(view.fillRest).not.toContain("2026-10-03");
    expect(view.fillRest).not.toContain("2026-10-04");
    expect(view.done).toBe(false);
  });

  it("is done once every bookable day has an Answer", () => {
    const answers = Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => [
        `2026-10-${String(i + 4).padStart(2, "0")}`,
        "busy" as const,
      ]),
    );

    expect(october({ answers }).done).toBe(true);
  });

  it("marks Sessions inside the Booking Window and drops the past ones", () => {
    const view = october({ sessionDates: ["2026-10-02", "2026-10-16", "2026-11-06"] });

    expect(view.days.filter((day) => day.session).map((day) => day.date)).toEqual(["2026-10-16"]);
  });

  it("reads a past month as read-only with every day locked", () => {
    const view = playerMonth({
      month: "2026-09",
      today,
      answers: { "2026-09-10": "free" },
      sessionDates: [],
    });

    expect(view.readOnly).toBe(true);
    expect(view.days.every((day) => day.locked)).toBe(true);
    expect(view.days[9]?.answer).toBe("free");
    expect(view.fillRest).toEqual([]);
  });

  it("navigates back freely and forward up to two months ahead", () => {
    expect(october().previousMonth).toBe("2026-09");
    expect(october().nextMonth).toBe("2026-11");
    expect(playerMonth({ month: "2026-12", today, answers: {}, sessionDates: [] }).nextMonth).toBe(
      null,
    );
  });
});
