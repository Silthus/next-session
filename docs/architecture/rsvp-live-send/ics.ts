export type Method = "REQUEST" | "PUBLISH" | "CANCEL";

export type Invite = {
  method: Method;
  uid: string;
  sequence: number;
  stamp: Date;
  start: LocalDateTime;
  durationHours: number;
  summary: string;
  location: string;
  description: string;
  url: string;
  organizer: string;
  attendee?: string;
  attendeeStatus?: "NEEDS-ACTION" | "ACCEPTED";
};

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export const TIME_ZONE = "Europe/Berlin";

const BERLIN_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildIcs(invite: Invite): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Next Session//RSVP live send//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${invite.method}`,
    ...BERLIN_VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
    `SEQUENCE:${invite.sequence}`,
    `DTSTAMP:${formatUtc(invite.stamp)}`,
    `DTSTART;TZID=${TIME_ZONE}:${formatLocal(invite.start)}`,
    `DTEND;TZID=${TIME_ZONE}:${formatLocal(addHours(invite.start, invite.durationHours))}`,
    `SUMMARY:${escapeText(invite.summary)}`,
    `LOCATION:${escapeText(invite.location)}`,
    `DESCRIPTION:${escapeText(invite.description)}`,
    `URL:${invite.url}`,
    `ORGANIZER;CN=Next Session:mailto:${invite.organizer}`,
    ...attendeeLines(invite),
    `STATUS:${invite.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function contentType(method: Method): string {
  return `text/calendar; charset=utf-8; method=${method}`;
}

function attendeeLines(invite: Invite): string[] {
  if (invite.attendee === undefined) return [];
  return [
    `ATTENDEE;CN=Player;ROLE=REQ-PARTICIPANT;PARTSTAT=${invite.attendeeStatus ?? "NEEDS-ACTION"};RSVP=FALSE:mailto:${invite.attendee}`,
  ];
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const MAX_OCTETS = 75;

function fold(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = chunks.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (encoder.encode(current + char).length > limit) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

function formatUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function formatLocal(time: LocalDateTime): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${time.year}${pad(time.month)}${pad(time.day)}T${pad(time.hour)}${pad(time.minute)}00`;
}

function addHours(time: LocalDateTime, hours: number): LocalDateTime {
  const shifted = new Date(
    Date.UTC(time.year, time.month - 1, time.day, time.hour + hours, time.minute),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}
