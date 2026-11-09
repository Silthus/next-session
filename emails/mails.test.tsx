import { describe, expect, it } from "vitest";
import { reminderMail } from "./ReminderMail";
import { welcomeMail } from "./WelcomeMail";

const MY_GROUPS = "https://next-session.link/me";

describe("welcomeMail", () => {
  it("welcomes the Account by first name and points to My groups", async () => {
    const mail = await welcomeMail({ firstName: "Ada", myGroupsUrl: MY_GROUPS });

    expect(mail.subject).toBe("Welcome to Next Session");
    expect(mail.text).toContain("Hi Ada 👋,");
    expect(mail.text).toContain("Open My groups https://next-session.link/me");
    expect(mail.text).toContain("Didn't create this account? Just reply and I'll delete it.");
    expect(mail.html).toContain('href="https://next-session.link/me"');
    expect(mail.text).not.toContain("tips");
  });

  it("says hi there without a name", async () => {
    const mail = await welcomeMail({ myGroupsUrl: MY_GROUPS });

    expect(mail.text).toContain("Hi there 👋,");
  });

  it("asks to confirm the Tips only when the Account asked for them", async () => {
    const confirm = "https://next-session.link/tips?confirm=a&b=<c>";

    const mail = await welcomeMail({ myGroupsUrl: MY_GROUPS, tipsConfirmUrl: confirm });

    expect(mail.text).toContain("Please confirm it was you, so I don't mail a stranger:");
    expect(mail.html).toContain('href="https://next-session.link/tips?confirm=a&amp;b=&lt;c&gt;"');
    expect(mail.html).toContain("Yes, send me the tips");
  });
});

describe("reminderMail", () => {
  const reminder = {
    playerName: "Robin",
    groupName: "Thursday <Crew> & Co",
    dateLabel: "Saturday, October 17, 2026",
    startLabel: "19:00",
    playerUrl: "https://next-session.link/s/share-token",
    remindersOffUrl: "https://next-session.link/reminders/off?t=token",
  };

  it("reminds the Player by name a day ahead, with the place", async () => {
    const mail = await reminderMail({ ...reminder, lead: "day", location: "Max's place" });

    expect(mail.subject).toBe("Tomorrow: Thursday <Crew> & Co at 19:00");
    expect(mail.text).toContain(
      "Hi Robin,\n\n" +
        "Thursday <Crew> & Co plays tomorrow, Saturday, October 17, 2026, at 19:00.\n" +
        "Where: Max's place",
    );
    expect(mail.html).toContain("Thursday &lt;Crew&gt; &amp; Co plays tomorrow");
    expect(mail.html).not.toContain("<Crew>");
  });

  it("reminds 2 hours ahead without a place, with a way to turn Reminders off", async () => {
    const mail = await reminderMail({ ...reminder, lead: "hours" });

    expect(mail.subject).toBe("In 2 hours: Thursday <Crew> & Co at 19:00");
    expect(mail.text).toContain("plays in 2 hours, Saturday, October 17, 2026, at 19:00.");
    expect(mail.text).not.toContain("Where:");
    expect(mail.text).toContain("Open your group https://next-session.link/s/share-token");
    expect(mail.html).toContain('href="https://next-session.link/reminders/off?t=token"');
  });
});
