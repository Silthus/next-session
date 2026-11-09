import { Action, Footnote, MailLayout, Paragraph } from "./MailLayout";
import { renderMail } from "./renderMail";

export type WelcomeMailProps = {
  /** The Account's first name, when its sign-in gave one. */
  firstName?: string;
  myGroupsUrl: string;
  /** Set when the Account asked for the Tips at sign-up and still has to confirm them. */
  tipsConfirmUrl?: string;
};

export function welcomeMail(props: WelcomeMailProps) {
  return renderMail("Welcome to Next Session", <WelcomeMail {...props} />);
}

export default function WelcomeMail({ firstName, myGroupsUrl, tipsConfirmUrl }: WelcomeMailProps) {
  return (
    <MailLayout preview="Your groups now follow you to every device.">
      <Paragraph>{`Hi ${firstName ?? "there"} 👋,`}</Paragraph>
      <Paragraph>thanks for creating your Next Session account!</Paragraph>
      <Paragraph>
        Your groups now follow you to every device. Log in on next-session.link with this email
        address, and My groups shows every group you run or play in.
      </Paragraph>
      <Action href={myGroupsUrl}>Open My groups</Action>
      {tipsConfirmUrl !== undefined && (
        <>
          <Paragraph>
            You asked for two short tips on getting your first game night on the calendar. Please
            confirm it was you, so I don&apos;t mail a stranger:
          </Paragraph>
          <Action href={tipsConfirmUrl}>Yes, send me the tips</Action>
        </>
      )}
      <Paragraph>Didn&apos;t create this account? Just reply and I&apos;ll delete it.</Paragraph>
      <Footnote>
        Thanks!
        <br />
        Michael
      </Footnote>
    </MailLayout>
  );
}

WelcomeMail.PreviewProps = {
  firstName: "Ada",
  myGroupsUrl: "https://next-session.link/me",
  tipsConfirmUrl: "https://next-session.link/tips?confirm=preview",
} satisfies WelcomeMailProps;
