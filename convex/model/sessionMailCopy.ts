import type { IsoDate } from "../../shared/dates";
import type { SessionWindow } from "../../shared/sessionTime";

export const SESSION_CHANGES = ["set", "changed", "cancelled"] as const;
export type SessionChange = (typeof SESSION_CHANGES)[number];

export type NightCopyInput = {
  change: SessionChange | "invite";
  reader: "gm" | "player";
  groupName: string;
  date: IsoDate;
  window: SessionWindow;
  timeZone: string;
  location?: string;
  groupLink: string;
};

export type WithdrawalCopyInput = { change: "withdraw"; groupName: string; date: IsoDate };

export type DeletionCancelCopyInput = {
  change: "deletionCancel";
  reader: "gm" | "player";
  groupName: string;
  date: IsoDate;
};

export type SessionMailCopyInput = NightCopyInput | WithdrawalCopyInput | DeletionCancelCopyInput;

export type MailCopy = { subject: string; text: string; html: string };

const MY_GROUPS_URL = "https://next-session.link/me";

type CalendarHint = { lead: string; tap?: { button: string; tail: string } };

const ADD_TO_CALENDAR: CalendarHint = {
  lead: "It's in the calendar invite in this mail. Not in your calendar yet? Tap ",
  tap: { button: "Add to calendar", tail: " once." },
};

const REMOVED_BY_CALENDAR: CalendarHint = {
  lead: "Your calendar removes it by itself. If it doesn't, delete it there.",
};

type Paragraphs = {
  subject: string;
  news: string;
  where: string | undefined;
  calendarHint: CalendarHint;
  groupLink: string | undefined;
  why: string;
};

export function sessionMailCopy(input: SessionMailCopyInput): MailCopy {
  const paragraphs = paragraphsOf(input);
  return { subject: paragraphs.subject, text: textOf(paragraphs), html: htmlOf(paragraphs) };
}

function paragraphsOf(input: SessionMailCopyInput): Paragraphs {
  if (input.change === "withdraw") return withdrawalOf(input);
  if (input.change === "deletionCancel") return deletionCancelOf(input);
  return nightOf(input);
}

function deletionCancelOf({
  reader,
  groupName: group,
  date: isoDate,
}: DeletionCancelCopyInput): Paragraphs {
  const date = dateLabel(isoDate);
  const gm = reader === "gm";
  return {
    subject: `${group}: session on ${date} cancelled`,
    news: gm
      ? `You deleted ${group}, so its session on ${date} is off.`
      : `${group} was deleted, so its session on ${date} is off.`,
    where: undefined,
    calendarHint: REMOVED_BY_CALENDAR,
    groupLink: undefined,
    why: `You get this because you ${gm ? "ran" : "kept"} this group.`,
  };
}

function withdrawalOf({ groupName: group, date: isoDate }: WithdrawalCopyInput): Paragraphs {
  const date = dateLabel(isoDate);
  return {
    subject: `${group}: session on ${date} removed from your calendar`,
    news: `You don't keep ${group} any more, so its session on ${date} leaves your calendar.`,
    where: undefined,
    calendarHint: REMOVED_BY_CALENDAR,
    groupLink: undefined,
    why: "You get this because you kept this group.",
  };
}

function nightOf(input: NightCopyInput): Paragraphs {
  const { change, reader, groupName: group } = input;
  const date = dateLabel(input.date);
  const when = `${date}, ${clockRange(input)}, ${cityOf(input.timeZone)} time`;
  const gm = reader === "gm";
  const news: Record<NightCopyInput["change"], { subject: string; news: string }> = {
    set: {
      subject: `${group}: next session ${date}`,
      news: gm
        ? `You set the next session for ${group}: ${when}.`
        : `The next session for ${group} is set: ${when}.`,
    },
    changed: {
      subject: `${group}: session on ${date} changed`,
      news: gm
        ? `You changed the session for ${group} on ${date}. It's now ${when}.`
        : `The session for ${group} on ${date} changed. It's now ${when}.`,
    },
    cancelled: {
      subject: `${group}: session on ${date} cancelled`,
      news: gm
        ? `You cancelled the session for ${group} on ${date}.`
        : `The session for ${group} on ${date} is cancelled.`,
    },
    invite: {
      subject: `${group}: next session ${date}`,
      news: gm
        ? `${group} is yours now, so its session is in your calendar: ${when}.`
        : `You keep ${group} now, so its session is in your calendar: ${when}.`,
    },
  };
  const cancelled = change === "cancelled";
  return {
    ...news[change],
    where: cancelled || input.location === undefined ? undefined : `Where: ${input.location}`,
    calendarHint: cancelled ? REMOVED_BY_CALENDAR : ADD_TO_CALENDAR,
    groupLink: input.groupLink,
    why: `You get this because you ${gm ? "run" : "keep"} this group.`,
  };
}

function textOf({ news, where, calendarHint, groupLink, why }: Paragraphs) {
  const { lead, tap } = calendarHint;
  return (
    [
      where === undefined ? news : `${news}\n${where}`,
      tap === undefined ? lead : `${lead}${tap.button}${tap.tail}`,
      ...(groupLink === undefined ? [] : [`Open your group: ${groupLink}`]),
      `${why}\nTurn session emails off in My groups: ${MY_GROUPS_URL}. Replies to this address aren't read.`,
    ].join("\n\n") + "\n"
  );
}

const INK = "#1a1511";
const LINK = "#835200";

function htmlOf({ news, where, calendarHint, groupLink, why }: Paragraphs) {
  const { lead, tap } = calendarHint;
  const calendarLine =
    escaped(lead) +
    (tap === undefined ? "" : `<strong>${escaped(tap.button)}</strong>${escaped(tap.tail)}`);
  const newsLine = escaped(news) + (where === undefined ? "" : `<br>${escaped(where)}`);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 0;background:#f2e7ce;font-family:'Trebuchet MS',Tahoma,Verdana,sans-serif;color:${INK};">
<div style="max-width:560px;margin:0 auto;background:#fbf5e5;padding:28px 32px;">
<p style="margin:0 0 18px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${LINK};font-weight:bold;">Next Session</p>
<p style="margin:0 0 14px;font-size:16px;line-height:160%;">${newsLine}</p>
<p style="margin:0 0 14px;font-size:16px;line-height:160%;">${calendarLine}</p>
${groupLink === undefined ? "" : buttonTo(groupLink)}<p style="margin:0;font-size:13px;line-height:160%;">${escaped(why)} Turn session emails off in <a href="${MY_GROUPS_URL}" style="color:${LINK};">My groups</a>. Replies to this address aren't read.</p>
</div>
</body></html>
`;
}

function buttonTo(groupLink: string) {
  return `<p style="margin:22px 0;"><a href="${escaped(groupLink)}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#c5953b;color:#221811;font-size:16px;text-decoration:none;">Open your group</a></p>
`;
}

function dateLabel(date: IsoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function clockRange({ window, timeZone }: NightCopyInput) {
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  return `${clock.format(window.start)}–${clock.format(window.end)}`;
}

function cityOf(timeZone: string) {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escaped(value: string) {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]!);
}
