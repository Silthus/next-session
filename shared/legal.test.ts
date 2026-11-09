import { describe, expect, it } from "vitest";
import privacy from "../docs/legal/privacy.md?raw";
import terms from "../docs/legal/terms.md?raw";
import { LEGAL_VERSIONS } from "./legal";

const texts = { terms, privacy };

function sectionOf(markdown: string, heading: string) {
  return markdown.split(/^## /m).find((section) => section.startsWith(heading)) ?? "";
}

function versionStampOf(markdown: string) {
  return /^\*\*Version (\d+\.\d+)\. Effective:/m.exec(markdown)?.[1];
}

describe("LEGAL_VERSIONS", () => {
  it.each(["terms", "privacy"] as const)("matches the version the %s text shows", (document) => {
    expect(versionStampOf(texts[document])).toBe(LEGAL_VERSIONS[document]);
  });
});

describe("privacy text", () => {
  it("has no placeholder left to fill in", () => {
    expect(privacy).not.toMatch(/placeholder, to be filled/i);
  });

  it("names both labels of the measurement switch on /privacy", () => {
    expect(privacy).toContain("**Turn off usage measurement in this browser**");
    expect(privacy).toContain("**Turn it back on**");
  });

  it("says what reaches Geoapify, why, how long it keeps it, and where it runs", () => {
    const processing = sectionOf(privacy, "2. What we process");
    expect(processing).toMatch(
      /\| Text you type into a group's location field.*Geoapify.*6\(1\)\(f\) \|/,
    );
    expect(processing).toContain("Geoapify keeps successful requests for at most 24 hours");
    expect(sectionOf(privacy, "4. Recipients")).toMatch(
      /Geoapify.*Cyprus.*Cloudflare and Bunny CDN/,
    );
  });

  it("names the Group's time and place, and a Session's own, among group data", () => {
    expect(sectionOf(privacy, "2. What we process")).toMatch(
      /\| Group names.*usual start time, length, time zone, and location.*a session's own start time, length, and location/,
    );
  });

  it("says how long Resend keeps session emails and their delivery logs", () => {
    expect(sectionOf(privacy, "5. How long we keep data")).toContain(
      "| Session emails with their calendar invites, and their delivery logs, at Resend | 30 days; removed from Resend's backups within 7 days after that |",
    );
  });

  it("leaves session emails to Resend alone, so PostHog neither sends them nor keeps an address for them", () => {
    const postHogRow = /\| PostHog Inc\. \|[^\n]*/.exec(sectionOf(privacy, "4. Recipients"))?.[0];
    const postHogProfile = /\| Your account's pseudonymous profile in PostHog[^\n]*/.exec(
      sectionOf(privacy, "5. How long we keep data"),
    )?.[0];
    const shareLinkReach = sectionOf(privacy, "2. What we process")
      .split("\n\n")
      .find((paragraph) => paragraph.includes("as mail content, which our backend sends"));
    for (const text of [postHogRow, postHogProfile, shareLinkReach])
      expect(text).not.toMatch(/session (updates|emails or)/i);
  });

  it("names the given name a Google sign-in gives, for the welcome mail's greeting", () => {
    expect(sectionOf(privacy, "2. What we process")).toContain(
      "| For an account: your email address, and for an account with Google the given name Google sends us | Send you one welcome mail, greeting you by name | Contract, 6(1)(b) |",
    );
  });

  it("says the welcome mail and reminders count opens and clicks, and the tips don't", () => {
    expect(sectionOf(privacy, "2. What we process")).toContain(
      "| For the welcome mail and reminders: whether and when you opened the mail, and which of its links you clicked. The mail carries a small invisible image, and its links pass through PostHog on the way to the page | Learn whether our mails arrive and are read, and which links help | Legitimate interest, 6(1)(f) |",
    );
    expect(privacy).not.toContain("Reminders are transactional service messages and carry no");
    expect(privacy).toContain("the tips carry no open or click tracking");
  });

  describe("Reminders", () => {
    it("says what a Reminder carries, why, and on which legal basis", () => {
      expect(sectionOf(privacy, "2. What we process")).toContain(
        "| For a player with an account, when reminders are on: your email address, your player name, group name, session date, start time, location and share link | Remind you 1 day and 2 hours before a session | Contract, 6(1)(b) |",
      );
    });

    it("names reminders among what PostHog sends, and among the mail it keeps the address for", () => {
      expect(sectionOf(privacy, "4. Recipients")).toMatch(/\| PostHog Inc\. \|[^\n]*reminders/);
      expect(sectionOf(privacy, "5. How long we keep data")).toMatch(
        /\| Your account's pseudonymous profile in PostHog, and your email address for[^\n]*reminders/,
      );
    });

    it("names the stored reminder setting and secret reminder link, and keeps them until the account goes", () => {
      expect(sectionOf(privacy, "2. What we process")).toMatch(
        /\| For an account:[^\n|]*whether you want reminders[^\n|]*secret reminder link[^\n|]*turns reminders off or on without signing in[^\n]*\| Contract, 6\(1\)\(b\) \|/,
      );
      expect(sectionOf(privacy, "5. How long we keep data")).toMatch(
        /\| Your reminder setting and reminder link \| Until your account is deleted/,
      );
    });

    it("says how to stop them, and that stopping them leaves session updates alone", () => {
      const reminderStop = sectionOf(privacy, "6. Your rights")
        .split("\n\n")
        .find((paragraph) => paragraph.includes("1 day and 2 hours before a session"));
      expect(reminderStop).toContain(
        'the "Email me 1 day and 2 hours before a session" switch on My groups',
      );
      expect(reminderStop).toContain("the link in every reminder");
      expect(reminderStop).toContain("Neither touches session updates");
    });
  });
});
