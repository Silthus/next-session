import { v } from "convex/values";
import { LOCATION_MAX_LENGTH } from "../../shared/limits";
import {
  groupTime,
  isClockTime,
  isLengthMinutes,
  isTimeZone,
  type ClockTime,
  type GroupTime,
  type SessionOverrides,
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

type SessionDetailsInput = {
  startTime?: string | null;
  lengthMinutes?: number | null;
  location?: string | null;
};

export const SESSION_DETAIL_FIELDS = ["startTime", "lengthMinutes", "location"] as const;

export type SessionDetailField = (typeof SESSION_DETAIL_FIELDS)[number];

export type SessionDetailChanges = Partial<Pick<Doc<"sessions">, SessionDetailField>>;

export const sessionDetailField = v.union(
  ...SESSION_DETAIL_FIELDS.map((field) => v.literal(field)),
);

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

export function sessionTimeAndPlace(group: Doc<"groups">, session: Doc<"sessions">) {
  const { startTime, lengthMinutes } = groupTimeOf(group);
  return {
    startTime: session.startTime ?? startTime,
    lengthMinutes: session.lengthMinutes ?? lengthMinutes,
    ...sessionLocationOf(group, session),
  };
}

export function sessionLocationOf(
  group: Doc<"groups">,
  session: Doc<"sessions">,
): { location?: string } {
  const location = session.location ?? group.location;
  return location ? { location } : {};
}

export function sessionOverridesOf(session: Doc<"sessions">): SessionOverrides {
  return {
    startTime: session.startTime as ClockTime | undefined,
    lengthMinutes: session.lengthMinutes,
  };
}

export function overriddenFields(session: Doc<"sessions">): SessionDetailField[] {
  return SESSION_DETAIL_FIELDS.filter((field) => session[field] !== undefined);
}

export function changedDetails(
  session: Doc<"sessions">,
  input: SessionDetailsInput,
): SessionDetailChanges {
  const details = validSessionDetails(input);
  const changed = SESSION_DETAIL_FIELDS.filter(
    (field) => field in details && details[field] !== session[field],
  );
  return Object.fromEntries(changed.map((field) => [field, details[field]]));
}

function validSessionDetails(input: SessionDetailsInput): SessionDetailChanges {
  const location = typeof input.location === "string" ? input.location.trim() : input.location;
  ensureValid(
    (typeof input.startTime !== "string" || isClockTime(input.startTime)) &&
      (typeof input.lengthMinutes !== "number" || isLengthMinutes(input.lengthMinutes)) &&
      (typeof location !== "string" || isLocation(location)),
  );
  return {
    ...followingWhenNull("startTime", input.startTime),
    ...followingWhenNull("lengthMinutes", input.lengthMinutes),
    ...followingWhenNull("location", location),
  };
}

function followingWhenNull<Field extends SessionDetailField>(
  field: Field,
  value: SessionDetailChanges[Field] | null,
): SessionDetailChanges {
  return value === undefined ? {} : { [field]: value ?? undefined };
}

export function hasSavedTimeAndPlace(group: Doc<"groups">) {
  return group.startTime !== undefined;
}

export function validTimeAndPlace(input: SettingsInput): TimeAndPlace {
  const location = input.location.trim();
  ensureValid(
    isClockTime(input.startTime) &&
      isLengthMinutes(input.lengthMinutes) &&
      isTimeZone(input.timeZone) &&
      isLocation(location),
  );
  return {
    startTime: input.startTime,
    lengthMinutes: input.lengthMinutes,
    timeZone: usualSpelling(input.timeZone),
    ...(location === "" ? {} : { location }),
  };
}

function isLocation(trimmed: string) {
  return trimmed.length <= LOCATION_MAX_LENGTH;
}

function ensureValid(valid: boolean): asserts valid {
  if (!valid) fail({ code: "INVALID_SETTINGS" });
}

export function knownTimeZone(browserTimeZone: unknown): string | undefined {
  return typeof browserTimeZone === "string" && isTimeZone(browserTimeZone)
    ? usualSpelling(browserTimeZone)
    : undefined;
}

function usualSpelling(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
}
