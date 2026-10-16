import { afterEach, describe, expect, it, vi } from "vitest";
import { type CalendarEntry, calendarContentType, feed, invite } from "./icalendar";
import cancelGolden from "./icalendar.golden/cancel.ics?raw";
import feedGolden from "./icalendar.golden/feed.ics?raw";
import requestGolden from "./icalendar.golden/request.ics?raw";
import withdrawGolden from "./icalendar.golden/withdraw.ics?raw";

const halloween: CalendarEntry = {
  uid: "j57c9w2qx8@next-session.link",
  sequence: 2,
  stamp: Date.UTC(2026, 9, 16, 9, 28),
  window: { start: Date.UTC(2026, 9, 31, 18), end: Date.UTC(2026, 9, 31, 22) },
  status: "CONFIRMED",
  summary: "Spieleabend C",
  location: "Bei Anna",
  description: "Next session of Spieleabend C.\nhttps://next-session.link/me",
  url: "https://next-session.link/me",
};

const servedAt = Date.UTC(2026, 9, 16, 9, 28, 5, 456);

const cancelledNovember: CalendarEntry = {
  ...halloween,
  uid: "j57d4r8kz1@next-session.link",
  sequence: 0,
  window: { start: Date.UTC(2026, 10, 7, 18, 30), end: Date.UTC(2026, 10, 7, 22, 30) },
  status: "CANCELLED",
  location: undefined,
};

const addresses = { organizer: "calendar@next-session.link", attendee: "player@example.com" };

describe("invite", () => {
  it("asks the attendee's calendar to add the Session as confirmed and already accepted", () => {
    expect(invite({ kind: "request", ...addresses, entry: halloween })).toBe(requestGolden);
  });

  it("tells every attendee's calendar that the Session is off", () => {
    expect(invite({ kind: "cancel", ...addresses, entry: halloween })).toBe(cancelGolden);
  });

  it("uninvites only this attendee, leaving the Session's status unsaid", () => {
    expect(invite({ kind: "withdraw", ...addresses, entry: halloween })).toBe(withdrawGolden);
  });
});

describe("feed", () => {
  it("lists scheduled and cancelled Sessions for a subscribed calendar, without invite headers", () => {
    const entries = [halloween, cancelledNovember].map((entry) => ({ ...entry, stamp: servedAt }));
    expect(feed("Next Session", entries)).toBe(feedGolden);
  });
});

describe("calendar text", () => {
  const corner = {
    ...halloween,
    location:
      "Spielebar Würfelglück, Hinterzimmer im ersten Stock, Ecke Schönhauser Allee 12, Berlin",
  };

  it("folds a long location at 75 octets without splitting its two-byte umlaut", () => {
    expect(feed("Next Session", [corner])).toContain(
      "\r\nLOCATION:Spielebar Würfelglück\\, Hinterzimmer im ersten Stock\\, Ecke Sch\r\n önhauser Allee 12\\, Berlin\r\n",
    );
  });

  it("escapes commas, semicolons, backslashes and line breaks in text", () => {
    const awkward = {
      ...halloween,
      summary: "D&D, Dienstag; Runde 3\\4",
      description: "Zeile eins\r\nZeile zwei\nZeile drei",
    };
    const text = feed("Kampagne, Dienstag", [awkward]);
    expect(text).toContain("\r\nX-WR-CALNAME:Kampagne\\, Dienstag\r\n");
    expect(text).toContain("\r\nSUMMARY:D&D\\, Dienstag\\; Runde 3\\\\4\r\n");
    expect(text).toContain("\r\nDESCRIPTION:Zeile eins\\nZeile zwei\\nZeile drei\r\n");
  });

  it("ends every line, the last one included, with CRLF", () => {
    const text = feed("Next Session", [corner]);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });
});

describe("every calendar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const everyCalendar = () => [
    invite({ kind: "request", ...addresses, entry: halloween }),
    invite({ kind: "cancel", ...addresses, entry: halloween }),
    invite({ kind: "withdraw", ...addresses, entry: halloween }),
    feed("Next Session", [halloween, { ...cancelledNovember, stamp: servedAt }]),
  ];

  it("writes every time in UTC and carries no time zone and no alarm", () => {
    for (const text of everyCalendar()) {
      const times = text.match(/^(DTSTAMP|DTSTART|DTEND)[:;].*$/gm) ?? [];
      expect(times).toHaveLength(3 * text.split("BEGIN:VEVENT").slice(1).length);
      for (const time of times) expect(time).toMatch(/^(DTSTAMP|DTSTART|DTEND):\d{8}T\d{6}Z$/);
      expect(text).not.toMatch(/VTIMEZONE|TZID|VALARM/);
    }
  });

  it("is the same text for the same entries, whatever the clock says", () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
    const january = everyCalendar();
    vi.setSystemTime(Date.UTC(2027, 6, 1, 12, 34, 56));
    expect(everyCalendar()).toEqual(january);
  });
});

describe("calendarContentType", () => {
  it("names the iMIP method each invite kind carries", () => {
    expect(calendarContentType("request")).toBe("text/calendar; charset=utf-8; method=REQUEST");
    expect(calendarContentType("cancel")).toBe("text/calendar; charset=utf-8; method=CANCEL");
    expect(calendarContentType("withdraw")).toBe("text/calendar; charset=utf-8; method=CANCEL");
  });
});
