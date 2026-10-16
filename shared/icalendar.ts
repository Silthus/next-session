export type SessionWindow = { start: number; end: number };

export type CalendarEntry = {
  uid: string;
  sequence: number;
  stamp: number;
  window: SessionWindow;
  status: "CONFIRMED" | "CANCELLED";
  summary: string;
  location?: string;
  description: string;
  url: string;
};

export type InviteKind = "request" | "cancel" | "withdraw";

export type InviteMessage = {
  kind: InviteKind;
  organizer: string;
  attendee: string;
  entry: CalendarEntry;
};

export function invite({ kind, organizer, attendee, entry }: InviteMessage): string {
  return calendar([
    `METHOD:${METHODS[kind]}`,
    ...event(entry, [
      ...INVITE_STATUS[kind],
      `ORGANIZER;CN=Next Session:mailto:${organizer}`,
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${attendee}`,
    ]),
  ]);
}

export function feed(calendarName: string, entries: CalendarEntry[]): string {
  return calendar([
    `X-WR-CALNAME:${escapedText(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...entries.flatMap((entry) => event(entry, [`STATUS:${entry.status}`])),
  ]);
}

export function calendarContentType(kind: InviteKind): string {
  return `text/calendar; charset=utf-8; method=${METHODS[kind]}`;
}

const METHODS: Record<InviteKind, "REQUEST" | "CANCEL"> = {
  request: "REQUEST",
  cancel: "CANCEL",
  withdraw: "CANCEL",
};

const INVITE_STATUS: Record<InviteKind, string[]> = {
  request: ["STATUS:CONFIRMED"],
  cancel: ["STATUS:CANCELLED"],
  withdraw: [],
};

function calendar(body: string[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Next Session//next-session.link//EN",
    "CALSCALE:GREGORIAN",
    ...body,
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

function event(entry: CalendarEntry, trailer: string[]): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${entry.uid}`,
    `SEQUENCE:${entry.sequence}`,
    `DTSTAMP:${utcDateTime(entry.stamp)}`,
    `DTSTART:${utcDateTime(entry.window.start)}`,
    `DTEND:${utcDateTime(entry.window.end)}`,
    `SUMMARY:${escapedText(entry.summary)}`,
    ...(entry.location === undefined ? [] : [`LOCATION:${escapedText(entry.location)}`]),
    `DESCRIPTION:${escapedText(entry.description)}`,
    `URL:${entry.url}`,
    ...trailer,
    "END:VEVENT",
  ];
}

function utcDateTime(epochMs: number): string {
  return new Date(epochMs)
    .toISOString()
    .replace(/\.\d{3}/, "")
    .replace(/[-:]/g, "");
}

function escapedText(value: string): string {
  return value.replace(/[\\;,]/g, "\\$&").replace(/\r\n|\r|\n/g, "\\n");
}

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;
const CONTINUATION = " ";

function fold(line: string): string {
  const segments: string[] = [];
  let segment = "";
  let segmentOctets = 0;
  for (const character of line) {
    const characterOctets = utf8Octets(character);
    if (segmentOctets + characterOctets > MAX_LINE_OCTETS) {
      segments.push(segment);
      segment = CONTINUATION;
      segmentOctets = CONTINUATION.length;
    }
    segment += character;
    segmentOctets += characterOctets;
  }
  segments.push(segment);
  return segments.join(CRLF);
}

const encoder = new TextEncoder();

function utf8Octets(character: string): number {
  return encoder.encode(character).length;
}
