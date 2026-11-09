import { describe, expect, it } from "vitest";
import { reminderMailCopy, welcomeMailCopy } from "./accountMailCopy";

const MY_GROUPS = "https://next-session.link/me";

describe("welcomeMailCopy", () => {
  it("welcomes the Account and points to My groups", () => {
    const copy = welcomeMailCopy({ myGroupsLink: MY_GROUPS });

    expect(copy.subject).toBe("Welcome to Next Session");
    expect(copy.text).toBe(
      "Hi there 👋,\n\n" +
        "thanks for creating your Next Session account!\n\n" +
        "Your groups now follow you to every device. Log in on next-session.link with this email address, and My groups shows every group you run or play in.\n\n" +
        "Open My groups: https://next-session.link/me\n\n" +
        "Didn't create this account? Just reply and I'll delete it.\n\n" +
        "Thanks!\nMichael\n",
    );
    expect(copy.html).toContain('href="https://next-session.link/me"');
    expect(copy.html).not.toContain("tips");
  });

  it("asks to confirm the Tips only when the Account asked for them", () => {
    const confirm = "https://next-session.link/tips?confirm=a&b=<c>";

    const copy = welcomeMailCopy({ myGroupsLink: MY_GROUPS, tipsConfirmUrl: confirm });

    expect(copy.text).toContain(
      "You asked for two short tips on getting your first game night on the calendar. Please confirm it was you, so I don't mail a stranger:\n\n" +
        `Yes, send me the tips: ${confirm}\n\n` +
        "Didn't create this account?",
    );
    expect(copy.html).toContain('href="https://next-session.link/tips?confirm=a&amp;b=&lt;c&gt;"');
    expect(copy.html).toContain("Yes, send me the tips");
  });
});

describe("reminderMailCopy", () => {
  const reminder = {
    groupName: "Thursday <Crew> & Co",
    dateLabel: "Saturday, October 17, 2026",
    startLabel: "19:00",
    playerUrl: "https://next-session.link/s/share-token",
    remindersOffUrl: "https://next-session.link/reminders/off?t=token",
  };

  it("reminds a day ahead with the place", () => {
    const copy = reminderMailCopy({ ...reminder, lead: "day", location: "Robin's" });

    expect(copy.subject).toBe("Tomorrow: Thursday <Crew> & Co at 19:00");
    expect(copy.text).toBe(
      "Hi there,\n\n" +
        "Thursday <Crew> & Co plays tomorrow, Saturday, October 17, 2026, at 19:00.\n" +
        "Where: Robin's\n\n" +
        "Open your group: https://next-session.link/s/share-token\n\n" +
        "You get this because you keep this group. Turn off reminders: https://next-session.link/reminders/off?t=token\n",
    );
    expect(copy.html).toContain("Thursday &lt;Crew&gt; &amp; Co plays tomorrow");
    expect(copy.html).toContain("Where: Robin&#39;s");
    expect(copy.html).not.toContain("<Crew>");
  });

  it("reminds 2 hours ahead without a place", () => {
    const copy = reminderMailCopy({ ...reminder, lead: "hours" });

    expect(copy.subject).toBe("In 2 hours: Thursday <Crew> & Co at 19:00");
    expect(copy.text).toContain("plays in 2 hours, Saturday, October 17, 2026, at 19:00.\n\n");
    expect(copy.text).not.toContain("Where:");
    expect(copy.html).toContain('href="https://next-session.link/reminders/off?t=token"');
    expect(copy.html).toContain('href="https://next-session.link/s/share-token"');
  });
});
