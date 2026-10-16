import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { daysToAnswer, nextSessions, type MyGroups } from "./myGroups";

const thursday = "group-thursday" as Id<"groups">;
const sunday = "group-sunday" as Id<"groups">;
const owned = "group-owned" as Id<"groups">;

type GroupSession = MyGroups["running"][number]["upcomingSessions"][number];

const USUAL = { startTime: "19:00", lengthMinutes: 240 } as const;
const BERLIN_USUAL = { ...USUAL, timeZone: "Europe/Berlin" };

const scheduled = (...dates: string[]): GroupSession[] =>
  dates.map((date) => ({ date, state: "scheduled", ...USUAL }));

const cancelled = (date: string): GroupSession => ({ date, state: "cancelled", ...USUAL });

function running(
  groupId: Id<"groups">,
  name: string,
  upcomingSessions: GroupSession[],
): MyGroups["running"][number] {
  return { groupId, name, timeZone: "Europe/Berlin", upcomingSessions };
}
function playing(
  groupId: Id<"groups">,
  name: string,
  upcomingSessions: GroupSession[],
): MyGroups["playing"][number] {
  return {
    groupId,
    name,
    shareToken: `token-${name}`,
    playerId: `player-${name}` as Id<"players">,
    playerName: "Robin",
    timeZone: "Europe/Berlin",
    upcomingSessions,
    openDates: 0,
  };
}

describe("nextSessions", () => {
  it("merges every Group's Sessions by date, each with its Group name and its page", () => {
    const groups: MyGroups = {
      running: [running(owned, "My table", scheduled("2026-10-09"))],
      playing: [
        playing(thursday, "Thursday Crew", scheduled("2026-10-08", "2026-10-15")),
        playing(sunday, "Sunday Saga", scheduled("2026-10-11")),
      ],
    };

    expect(nextSessions(groups)).toEqual([
      {
        date: "2026-10-08",
        cancelled: false,
        time: BERLIN_USUAL,
        groupName: "Thursday Crew",
        to: { kind: "player", shareToken: "token-Thursday Crew" },
      },
      {
        date: "2026-10-09",
        cancelled: false,
        time: BERLIN_USUAL,
        groupName: "My table",
        to: { kind: "gm", groupId: owned },
      },
      {
        date: "2026-10-11",
        cancelled: false,
        time: BERLIN_USUAL,
        groupName: "Sunday Saga",
        to: { kind: "player", shareToken: "token-Sunday Saga" },
      },
      {
        date: "2026-10-15",
        cancelled: false,
        time: BERLIN_USUAL,
        groupName: "Thursday Crew",
        to: { kind: "player", shareToken: "token-Thursday Crew" },
      },
    ]);
  });

  it("marks a Cancelled Session and keeps its link to the Group page", () => {
    const groups: MyGroups = {
      running: [running(owned, "My table", [cancelled("2026-10-09")])],
      playing: [playing(thursday, "Thursday Crew", [cancelled("2026-10-08")])],
    };

    expect(nextSessions(groups)).toEqual([
      {
        date: "2026-10-08",
        cancelled: true,
        time: BERLIN_USUAL,
        groupName: "Thursday Crew",
        to: { kind: "player", shareToken: "token-Thursday Crew" },
      },
      {
        date: "2026-10-09",
        cancelled: true,
        time: BERLIN_USUAL,
        groupName: "My table",
        to: { kind: "gm", groupId: owned },
      },
    ]);
  });

  it("shows the next five", () => {
    const groups: MyGroups = {
      running: [
        running(
          owned,
          "My table",
          scheduled("2026-10-07", "2026-10-09", "2026-10-11", "2026-10-13", "2026-10-15"),
        ),
      ],
      playing: [playing(thursday, "Thursday Crew", scheduled("2026-10-08", "2026-10-10"))],
    };

    expect(nextSessions(groups).map(({ date }) => date)).toEqual([
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("lists a Session once when the Account runs the Group and plays in it", () => {
    const groups: MyGroups = {
      running: [running(thursday, "Thursday Crew", scheduled("2026-10-08"))],
      playing: [playing(thursday, "Thursday Crew", scheduled("2026-10-08"))],
    };

    expect(nextSessions(groups)).toEqual([
      {
        date: "2026-10-08",
        cancelled: false,
        time: BERLIN_USUAL,
        groupName: "Thursday Crew",
        to: { kind: "gm", groupId: thursday },
      },
    ]);
  });

  it("orders two Groups' Sessions on the same night by Group name", () => {
    const groups: MyGroups = {
      running: [running(owned, "Zeta", scheduled("2026-10-08"))],
      playing: [playing(thursday, "Alpha", scheduled("2026-10-08"))],
    };

    expect(nextSessions(groups).map(({ groupName }) => groupName)).toEqual(["Alpha", "Zeta"]);
  });

  it("is empty without Sessions", () => {
    expect(nextSessions({ running: [], playing: [] })).toEqual([]);
  });
});

describe("daysToAnswer", () => {
  it.each([
    [0, null],
    [1, "1 day to answer"],
    [12, "12 days to answer"],
  ])("reads %i open dates as %s", (openDates, copy) => {
    expect(daysToAnswer(openDates)).toBe(copy);
  });
});
