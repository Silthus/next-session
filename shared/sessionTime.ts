import type { IsoDate } from "./dates";

export type ClockTime = `${number}:${number}`;

export type GroupTime = { startTime: ClockTime; lengthMinutes: number; timeZone: string };

export const DEFAULT_GROUP_TIME: GroupTime = {
  startTime: "19:00",
  lengthMinutes: 240,
  timeZone: "Europe/Berlin",
};

export type SessionWindow = { start: number; end: number };

export type SessionOverrides = { startTime?: ClockTime; lengthMinutes?: number };

export type ReminderLead = "day" | "hours";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MINUTES_PER_DAY = 24 * 60;
const REMINDER_LEAD: Record<ReminderLead, number> = { day: DAY, hours: 2 * HOUR };
const CLOCK_TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SHORTEST_SESSION_MINUTES = 30;
const LONGEST_SESSION_MINUTES = 720;
const SESSION_LENGTH_STEP_MINUTES = 15;

export function groupTime(group: Partial<GroupTime>): GroupTime {
  return {
    startTime: group.startTime ?? DEFAULT_GROUP_TIME.startTime,
    lengthMinutes: group.lengthMinutes ?? DEFAULT_GROUP_TIME.lengthMinutes,
    timeZone: group.timeZone ?? DEFAULT_GROUP_TIME.timeZone,
  };
}

export function sessionWindow(
  date: IsoDate,
  time: GroupTime,
  overrides: SessionOverrides = {},
): SessionWindow {
  const start = zonedInstant(date, overrides.startTime ?? time.startTime, time.timeZone);
  const lengthMinutes = overrides.lengthMinutes ?? time.lengthMinutes;
  return { start, end: start + lengthMinutes * MINUTE };
}

export function reminderDueAt(start: number, lead: ReminderLead): number {
  return start - REMINDER_LEAD[lead];
}

export function endClockTime(startTime: ClockTime, lengthMinutes: number): ClockTime {
  const minutes = (minutesOfDay(startTime) + lengthMinutes) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}` as ClockTime;
}

export function isClockTime(value: string): value is ClockTime {
  return CLOCK_TIME_SHAPE.test(value);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isLengthMinutes(value: number): boolean {
  return (
    Number.isInteger(value / SESSION_LENGTH_STEP_MINUTES) &&
    value >= SHORTEST_SESSION_MINUTES &&
    value <= LONGEST_SESSION_MINUTES
  );
}

function zonedInstant(date: IsoDate, clock: ClockTime, timeZone: string): number {
  const wallClock = wallClockAsUtc(date, clock);
  const offsetBefore = zoneOffset(wallClock - DAY, timeZone);
  const offsetAfter = zoneOffset(wallClock + DAY, timeZone);
  const earliest = wallClock - Math.max(offsetBefore, offsetAfter);
  const latest = wallClock - Math.min(offsetBefore, offsetAfter);
  const occurrences = [earliest, latest].filter(
    (instant) => instant + zoneOffset(instant, timeZone) === wallClock,
  );
  return occurrences[0] ?? firstInstantAfterGap(earliest, latest, offsetAfter, timeZone);
}

function firstInstantAfterGap(
  beforeGap: number,
  afterGap: number,
  offsetAfterGap: number,
  timeZone: string,
): number {
  let before = beforeGap;
  let after = afterGap;
  while (after - before > MINUTE) {
    const middle = before + Math.floor((after - before) / 2 / MINUTE) * MINUTE;
    if (zoneOffset(middle, timeZone) === offsetAfterGap) after = middle;
    else before = middle;
  }
  return after;
}

function wallClockAsUtc(date: IsoDate, clock: ClockTime): number {
  const midnight = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return midnight + minutesOfDay(clock) * MINUTE;
}

function zoneOffset(instant: number, timeZone: string): number {
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zoneFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  zoneFormatters.set(timeZone, formatter);
  return formatter;
}

function minutesOfDay(clock: ClockTime): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
