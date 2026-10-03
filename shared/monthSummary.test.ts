import { describe, expect, it } from "vitest";
import type { Answer } from "./answers";
import { summarizeMonth, type DaySummary } from "./monthSummary";

const ana = { _id: "p-ana", name: "Ana" };
const ben = { _id: "p-ben", name: "Ben" };
const cy = { _id: "p-cy", name: "Cy" };

const answer = (player: { _id: string }, date: string, value: Answer) => ({
  playerId: player._id,
  date,
  answer: value,
});

const october = {
  month: "2026-10",
  today: "2026-10-28",
  players: [ana, ben, cy],
  answers: [],
  sessions: [],
};

function day(days: readonly DaySummary<typeof ana, { _id: string; date: string }>[], date: string) {
  const found = days.find((d) => d.date === date);
  if (!found) throw new Error(`no summary for ${date}`);
  return found;
}

describe("summarizeMonth days", () => {
  it("has one day per date of the month", () => {
    const { days } = summarizeMonth(october);
    expect(days.map((d) => d.date)).toHaveLength(31);
    expect(days[0]?.date).toBe("2026-10-01");
  });

  it("marks dates before today as past and not bookable", () => {
    const { days } = summarizeMonth(october);
    expect(day(days, "2026-10-27")).toMatchObject({ past: true, bookable: false });
    expect(day(days, "2026-10-28")).toMatchObject({ past: false, bookable: true });
  });

  it("marks dates after the Booking Window as neither past nor bookable", () => {
    const { days } = summarizeMonth({ ...october, month: "2027-01" });
    expect(day(days, "2027-01-01")).toMatchObject({ past: false, bookable: false });
  });

  it("attaches the Session on its date", () => {
    const session = { _id: "s-1", date: "2026-10-30" };
    const { days } = summarizeMonth({
      ...october,
      sessions: [{ _id: "s-0", date: "2026-11-02" }, session],
    });
    expect(day(days, "2026-10-30").session).toBe(session);
    expect(day(days, "2026-10-29").session).toBeNull();
  });
});

describe("summarizeMonth answers per day", () => {
  it("sorts the Roster into free, maybe, busy, and unanswered", () => {
    const { days } = summarizeMonth({
      ...october,
      answers: [answer(ana, "2026-10-29", "free"), answer(ben, "2026-10-29", "maybe")],
    });
    expect(day(days, "2026-10-29")).toMatchObject({
      free: [ana],
      maybe: [ben],
      busy: [],
      unanswered: [cy],
    });
  });

  it("ignores Answers of Players no longer on the Roster", () => {
    const { days } = summarizeMonth({
      ...october,
      answers: [answer({ _id: "p-gone" }, "2026-10-29", "busy")],
    });
    expect(day(days, "2026-10-29")).toMatchObject({ busy: [], unanswered: [ana, ben, cy] });
  });

  it("heats a day by the share of Players who are free", () => {
    const { days } = summarizeMonth({
      ...october,
      answers: [answer(ana, "2026-10-29", "free"), answer(ben, "2026-10-29", "maybe")],
    });
    expect(day(days, "2026-10-29").heat).toBeCloseTo(1 / 3);
    expect(day(days, "2026-10-30").heat).toBe(0);
  });

  it("gives a day with any busy Answer no heat", () => {
    const { days } = summarizeMonth({
      ...october,
      answers: [
        answer(ana, "2026-10-29", "free"),
        answer(ben, "2026-10-29", "free"),
        answer(cy, "2026-10-29", "busy"),
      ],
    });
    expect(day(days, "2026-10-29").heat).toBe(0);
  });

  it("calls a day perfect when every Player is free", () => {
    const { days } = summarizeMonth({
      ...october,
      answers: [
        answer(ana, "2026-10-29", "free"),
        answer(ben, "2026-10-29", "free"),
        answer(cy, "2026-10-29", "free"),
        answer(ana, "2026-10-30", "free"),
        answer(ben, "2026-10-30", "free"),
      ],
    });
    expect(day(days, "2026-10-29")).toMatchObject({ heat: 1, perfect: true });
    expect(day(days, "2026-10-30").perfect).toBe(false);
  });

  it("never calls a day perfect for an empty Roster", () => {
    const { days } = summarizeMonth({ ...october, players: [] });
    expect(day(days, "2026-10-29")).toMatchObject({ heat: 0, perfect: false });
  });
});

describe("summarizeMonth Best Nights", () => {
  const midOctober = { ...october, today: "2026-10-20" };
  const allFree = (date: string) => [ana, ben, cy].map((p) => answer(p, date, "free"));

  it("ranks the top three dates by free Players, with maybe counting half and ties going to the earlier date", () => {
    const { bestNights } = summarizeMonth({
      ...midOctober,
      answers: [
        answer(ana, "2026-10-21", "free"),
        answer(ben, "2026-10-21", "free"),
        answer(ana, "2026-10-22", "free"),
        answer(ben, "2026-10-22", "maybe"),
        answer(cy, "2026-10-22", "maybe"),
        answer(ana, "2026-10-24", "maybe"),
        ...allFree("2026-10-25"),
      ],
    });
    expect(bestNights.map((night) => night.date)).toEqual([
      "2026-10-25",
      "2026-10-21",
      "2026-10-22",
    ]);
  });

  it("leaves out any date a Player answered busy", () => {
    const { bestNights } = summarizeMonth({
      ...midOctober,
      answers: [
        answer(ana, "2026-10-23", "free"),
        answer(ben, "2026-10-23", "free"),
        answer(cy, "2026-10-23", "busy"),
        answer(ana, "2026-10-24", "maybe"),
      ],
    });
    expect(bestNights.map((night) => night.date)).toEqual(["2026-10-24"]);
  });

  it("leaves out past dates", () => {
    const { bestNights } = summarizeMonth({ ...midOctober, answers: allFree("2026-10-19") });
    expect(bestNights).toEqual([]);
  });

  it("leaves out dates nobody is free or maybe on", () => {
    const { bestNights } = summarizeMonth(midOctober);
    expect(bestNights).toEqual([]);
  });

  it("carries the day so the GM sees who is free", () => {
    const { bestNights } = summarizeMonth({ ...midOctober, answers: allFree("2026-10-25") });
    expect(bestNights[0]).toMatchObject({ date: "2026-10-25", free: [ana, ben, cy] });
  });
});

describe("summarizeMonth progress", () => {
  it("counts each Player's answered dates out of the dates still open this month", () => {
    const { progress } = summarizeMonth({
      ...october,
      answers: [
        answer(ana, "2026-10-01", "free"),
        answer(ana, "2026-10-29", "busy"),
        answer(ana, "2026-10-30", "maybe"),
        answer(ben, "2026-10-31", "free"),
      ],
    });
    expect(progress).toEqual([
      { player: ana, answered: 2, fillable: 4 },
      { player: ben, answered: 1, fillable: 4 },
      { player: cy, answered: 0, fillable: 4 },
    ]);
  });
});
