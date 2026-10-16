import { endClockTime, type ClockTime, type GroupTime } from "../../shared/sessionTime";
import { browserTimeZone } from "./timeZone";

export type WallClockTime = Pick<GroupTime, "lengthMinutes" | "timeZone"> & { startTime: string };

export function timeRange(time: WallClockTime, viewerTimeZone = browserTimeZone()): string {
  const range = `${time.startTime}–${endClockTime(time.startTime as ClockTime, time.lengthMinutes)}`;
  return `${range}${zoneSuffix(time.timeZone, viewerTimeZone)}`;
}

export function zoneSuffix(timeZone: string, viewerTimeZone = browserTimeZone()): string {
  return sameZone(timeZone, viewerTimeZone) ? "" : ` ${zoneName(timeZone)}`;
}

export function zoneName(timeZone: string): string {
  const city = timeZone.split("/").at(-1) ?? timeZone;
  return `${city.replaceAll("_", " ")} time`;
}

function sameZone(a: string, b: string): boolean {
  return canonicalZone(a) === canonicalZone(b);
}

function canonicalZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
}
