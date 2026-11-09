import type { IsoDate } from "../../shared/dates";
import type { SessionWindow } from "../../shared/sessionTime";
import { button, escaped, footnote, link, mailPage, paragraph, type MailCopy } from "./mailHtml";

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
  myGroupsLink: string;
};

export type WithdrawalCopyInput = {
  change: "withdraw";
  groupName: string;
  date: IsoDate;
  myGroupsLink: string;
};

export type DeletionCancelCopyInput = {
  change: "deletionCancel";
  reader: "gm" | "player";
  groupName: string;
  date: IsoDate;
  myGroupsLink: string;
};

export type SessionMailCopyInput = NightCopyInput | WithdrawalCopyInput | DeletionCancelCopyInput;

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
  const { myGroupsLink } = input;
  return {
    subject: paragraphs.subject,
    text: textOf(paragraphs, myGroupsLink),
    html: htmlOf(paragraphs, myGroupsLink),
  };
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

function textOf({ news, where, calendarHint, groupLink, why }: Paragraphs, myGroupsLink: string) {
  const { lead, tap } = calendarHint;
  return (
    [
      where === undefined ? news : `${news}\n${where}`,
      tap === undefined ? lead : `${lead}${tap.button}${tap.tail}`,
      ...(groupLink === undefined ? [] : [`Open your group: ${groupLink}`]),
      `${why}\nTurn session emails off in My groups: ${myGroupsLink}. Replies to this address aren't read.`,
    ].join("\n\n") + "\n"
  );
}

function htmlOf({ news, where, calendarHint, groupLink, why }: Paragraphs, myGroupsLink: string) {
  const { lead, tap } = calendarHint;
  const calendarLine =
    escaped(lead) +
    (tap === undefined ? "" : `<strong>${escaped(tap.button)}</strong>${escaped(tap.tail)}`);
  const newsLine = escaped(news) + (where === undefined ? "" : `<br>${escaped(where)}`);
  return mailPage([
    paragraph(newsLine),
    paragraph(calendarLine),
    ...(groupLink === undefined ? [] : [button(groupLink, "Open your group")]),
    footnote(
      `${escaped(why)} Turn session emails off in ${link(myGroupsLink, "My groups")}. Replies to this address aren't read.`,
    ),
  ]);
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
