import { button, escaped, footnote, link, mailPage, paragraph, type MailCopy } from "./mailHtml";

export type WelcomeCopyInput = { myGroupsLink: string; tipsConfirmUrl?: string };

const TIPS_ASK =
  "You asked for two short tips on getting your first game night on the calendar. Please confirm it was you, so I don't mail a stranger:";

export function welcomeMailCopy({ myGroupsLink, tipsConfirmUrl }: WelcomeCopyInput): MailCopy {
  const greeting = "Hi there 👋,";
  const thanks = "thanks for creating your Next Session account!";
  const groups =
    "Your groups now follow you to every device. Log in on next-session.link with this email address, and My groups shows every group you run or play in.";
  const notYou = "Didn't create this account? Just reply and I'll delete it.";
  const tips =
    tipsConfirmUrl === undefined ? [] : [TIPS_ASK, `Yes, send me the tips: ${tipsConfirmUrl}`];
  return {
    subject: "Welcome to Next Session",
    text:
      [
        greeting,
        thanks,
        groups,
        `Open My groups: ${myGroupsLink}`,
        ...tips,
        notYou,
        "Thanks!\nMichael",
      ].join("\n\n") + "\n",
    html: mailPage([
      paragraph(escaped(greeting)),
      paragraph(escaped(thanks)),
      paragraph(escaped(groups)),
      button(myGroupsLink, "Open My groups"),
      ...(tipsConfirmUrl === undefined
        ? []
        : [paragraph(escaped(TIPS_ASK)), button(tipsConfirmUrl, "Yes, send me the tips")]),
      paragraph(escaped(notYou)),
      footnote("Thanks!<br>Michael"),
    ]),
  };
}

export type ReminderCopyInput = {
  lead: "day" | "hours";
  groupName: string;
  dateLabel: string;
  startLabel: string;
  location?: string;
  playerUrl: string;
  remindersOffUrl: string;
};

export function reminderMailCopy(input: ReminderCopyInput): MailCopy {
  const { groupName, dateLabel, startLabel, location, playerUrl, remindersOffUrl } = input;
  const day = input.lead === "day";
  const news = `${groupName} plays ${day ? "tomorrow" : "in 2 hours"}, ${dateLabel}, at ${startLabel}.`;
  const where = location === undefined ? undefined : `Where: ${location}`;
  const why = "You get this because you keep this group.";
  return {
    subject: `${day ? "Tomorrow" : "In 2 hours"}: ${groupName} at ${startLabel}`,
    text:
      [
        "Hi there,",
        where === undefined ? news : `${news}\n${where}`,
        `Open your group: ${playerUrl}`,
        `${why} Turn off reminders: ${remindersOffUrl}`,
      ].join("\n\n") + "\n",
    html: mailPage([
      paragraph("Hi there,"),
      paragraph(escaped(news) + (where === undefined ? "" : `<br>${escaped(where)}`)),
      button(playerUrl, "Open your group"),
      footnote(`${escaped(why)} ${link(remindersOffUrl, "Turn off reminders")}.`),
    ]),
  };
}
