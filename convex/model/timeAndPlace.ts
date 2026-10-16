import { v } from "convex/values";
import { LOCATION_MAX_LENGTH } from "../../shared/limits";
import {
  groupTime,
  isClockTime,
  isLengthMinutes,
  isTimeZone,
  type ClockTime,
  type GroupTime,
} from "../../shared/sessionTime";
import type { Doc } from "../_generated/dataModel";
import { fail } from "./errors";

export type TimeAndPlace = GroupTime & { location?: string };

type SettingsInput = {
  startTime: string;
  lengthMinutes: number;
  timeZone: string;
  location: string;
};

export const sessionTimeAndPlaceFields = {
  startTime: v.string(),
  lengthMinutes: v.number(),
  location: v.optional(v.string()),
};

export const timeAndPlaceView = v.object({ ...sessionTimeAndPlaceFields, timeZone: v.string() });

export function groupTimeOf(group: Doc<"groups">): GroupTime {
  return groupTime({
    startTime: group.startTime as ClockTime | undefined,
    lengthMinutes: group.lengthMinutes,
    timeZone: group.timeZone,
  });
}

export function locationOf(group: Doc<"groups">): { location?: string } {
  return group.location === undefined ? {} : { location: group.location };
}

export function timeAndPlaceOf(group: Doc<"groups">): TimeAndPlace {
  return { ...groupTimeOf(group), ...locationOf(group) };
}

export function sessionTimeAndPlace(group: Doc<"groups">) {
  const { startTime, lengthMinutes } = groupTimeOf(group);
  return { startTime, lengthMinutes, ...locationOf(group) };
}

export function hasSavedTimeAndPlace(group: Doc<"groups">) {
  return group.startTime !== undefined;
}

export function validTimeAndPlace(input: SettingsInput): TimeAndPlace {
  const location = input.location.trim();
  if (
    !isClockTime(input.startTime) ||
    !isLengthMinutes(input.lengthMinutes) ||
    !isTimeZone(input.timeZone) ||
    location.length > LOCATION_MAX_LENGTH
  ) {
    fail({ code: "INVALID_SETTINGS" });
  }
  return {
    startTime: input.startTime,
    lengthMinutes: input.lengthMinutes,
    timeZone: usualSpelling(input.timeZone),
    ...(location === "" ? {} : { location }),
  };
}

export function knownTimeZone(browserTimeZone: unknown): string | undefined {
  return typeof browserTimeZone === "string" && isTimeZone(browserTimeZone)
    ? usualSpelling(browserTimeZone)
    : undefined;
}

function usualSpelling(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
}
