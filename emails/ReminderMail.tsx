import { Action, Footnote, InlineLink, MailLayout, Paragraph } from "./MailLayout";
import { renderMail } from "./renderMail";

export type ReminderMailProps = {
  /** The name the Group knows the Account's Claimed Player by. */
  playerName: string;
  lead: "day" | "hours";
  groupName: string;
  dateLabel: string;
  startLabel: string;
  location?: string;
  playerUrl: string;
  remindersOffUrl: string;
};

export function reminderMail(props: ReminderMailProps) {
  const when = props.lead === "day" ? "Tomorrow" : "In 2 hours";
  return renderMail(
    `${when}: ${props.groupName} at ${props.startLabel}`,
    <ReminderMail {...props} />,
  );
}

export default function ReminderMail(props: ReminderMailProps) {
  const { playerName, groupName, dateLabel, startLabel, location, playerUrl } = props;
  const news = `${groupName} plays ${props.lead === "day" ? "tomorrow" : "in 2 hours"}, ${dateLabel}, at ${startLabel}.`;
  return (
    <MailLayout preview={news}>
      <Paragraph>{`Hi ${playerName},`}</Paragraph>
      <Paragraph>
        {news}
        {location !== undefined && (
          <>
            <br />
            {`Where: ${location}`}
          </>
        )}
      </Paragraph>
      <Action href={playerUrl}>Open your group</Action>
      <Footnote>
        You get this because you keep this group.{" "}
        <InlineLink href={props.remindersOffUrl}>Turn off reminders</InlineLink>
      </Footnote>
    </MailLayout>
  );
}

ReminderMail.PreviewProps = {
  playerName: "Robin",
  lead: "day",
  groupName: "Thursday Crew",
  dateLabel: "Saturday, October 17, 2026",
  startLabel: "19:00",
  location: "Max's place",
  playerUrl: "https://next-session.link/s/preview",
  remindersOffUrl: "https://next-session.link/reminders/off?t=preview",
} satisfies ReminderMailProps;
