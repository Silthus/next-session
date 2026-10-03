import { describe, expect, it } from "vitest";
import { fillRestDates, monthProgress, nextAnswer } from "./answers";

describe("nextAnswer", () => {
  it("cycles a tapped date through free, maybe, busy, and back to unanswered", () => {
    expect(nextAnswer(null)).toBe("free");
    expect(nextAnswer("free")).toBe("maybe");
    expect(nextAnswer("maybe")).toBe("busy");
    expect(nextAnswer("busy")).toBeNull();
  });
});

describe("fillRestDates", () => {
  const today = "2026-10-28";

  it("is every unanswered date left in the month, from today on", () => {
    expect(fillRestDates("2026-10", today, new Set(["2026-10-29"]))).toEqual([
      "2026-10-28",
      "2026-10-30",
      "2026-10-31",
    ]);
  });

  it("is empty when every date left is answered", () => {
    const answered = new Set(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(fillRestDates("2026-10", today, answered)).toEqual([]);
  });

  it("is empty for a past month and for a month after the Booking Window", () => {
    expect(fillRestDates("2026-09", today, new Set())).toEqual([]);
    expect(fillRestDates("2027-01", today, new Set())).toEqual([]);
  });
});

describe("monthProgress", () => {
  it("counts answered dates out of the dates a Player can still answer this month", () => {
    const answered = new Set(["2026-10-01", "2026-10-29", "2026-10-30"]);
    expect(monthProgress("2026-10", "2026-10-28", answered)).toEqual({
      answered: 2,
      fillable: 4,
    });
  });

  it("has nothing fillable in a past month", () => {
    expect(monthProgress("2026-09", "2026-10-28", new Set(["2026-09-30"]))).toEqual({
      answered: 0,
      fillable: 0,
    });
  });
});
