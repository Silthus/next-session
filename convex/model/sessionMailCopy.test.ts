import { describe, expect, it } from "vitest";
import { sessionMailCopy, type SessionMailCopyInput } from "./sessionMailCopy";

const halloween: SessionMailCopyInput = {
  change: "set",
  reader: "player",
  groupName: "Thursday Crew",
  date: "2026-10-31",
  window: { start: Date.UTC(2026, 9, 31, 18), end: Date.UTC(2026, 9, 31, 22) },
  timeZone: "Europe/Berlin",
  location: "Max's place",
  groupLink: "https://next-session.link/s/share-token",
};

const WHEN = "Saturday, October 31, 2026, 19:00–23:00, Berlin time";

function firstParagraph(text: string) {
  return text.split("\n\n")[0];
}

describe("the Session mail a Player gets", () => {
  it("announces a set Session with when, where, the invite hint, the group link and why it came", () => {
    const { subject, text } = sessionMailCopy(halloween);

    expect(subject).toBe("Thursday Crew: next session Saturday, October 31, 2026");
    expect(text).toBe(
      [
        `The next session for Thursday Crew is set: ${WHEN}.\nWhere: Max's place`,
        "It's in the calendar invite in this mail. Not in your calendar yet? Tap Add to calendar once.",
        "Open your group: https://next-session.link/s/share-token",
        "You get this because you keep this group.\nTurn session emails off in My groups: https://next-session.link/me. Replies to this address aren't read.",
      ].join("\n\n") + "\n",
    );
  });

  it("leaves the Where line out when the Session has no location", () => {
    const { text } = sessionMailCopy({ ...halloween, location: undefined });

    expect(firstParagraph(text)).toBe(`The next session for Thursday Crew is set: ${WHEN}.`);
  });

  it("says what a changed Session is now", () => {
    const { subject, text } = sessionMailCopy({ ...halloween, change: "changed" });

    expect(subject).toBe("Thursday Crew: session on Saturday, October 31, 2026 changed");
    expect(firstParagraph(text)).toBe(
      `The session for Thursday Crew on Saturday, October 31, 2026 changed. It's now ${WHEN}.\nWhere: Max's place`,
    );
  });

  it("tells a cancel without when or where, and that the calendar removes it", () => {
    const { subject, text } = sessionMailCopy({ ...halloween, change: "cancelled" });

    expect(subject).toBe("Thursday Crew: session on Saturday, October 31, 2026 cancelled");
    expect(text.split("\n\n").slice(0, 3)).toEqual([
      "The session for Thursday Crew on Saturday, October 31, 2026 is cancelled.",
      "Your calendar removes it by itself. If it doesn't, delete it there.",
      "Open your group: https://next-session.link/s/share-token",
    ]);
  });
});

describe("the Session mail the GM gets", () => {
  const gm = {
    ...halloween,
    reader: "gm",
    groupLink: "https://next-session.link/g/group-id",
  } as const;

  it.each([
    ["set", `You set the next session for Thursday Crew: ${WHEN}.\nWhere: Max's place`],
    [
      "changed",
      `You changed the session for Thursday Crew on Saturday, October 31, 2026. It's now ${WHEN}.\nWhere: Max's place`,
    ],
    ["cancelled", "You cancelled the session for Thursday Crew on Saturday, October 31, 2026."],
  ] as const)("says you for a %s Session", (change, paragraph) => {
    expect(firstParagraph(sessionMailCopy({ ...gm, change }).text)).toBe(paragraph);
  });

  it("links the GM surface and says the GM runs the group", () => {
    const { text } = sessionMailCopy(gm);

    expect(text).toContain("Open your group: https://next-session.link/g/group-id");
    expect(text).toContain("You get this because you run this group.\n");
  });
});

describe("the HTML part", () => {
  it("says the same words with one button to the group", () => {
    const { html } = sessionMailCopy(halloween);

    expect(html).toContain(`The next session for Thursday Crew is set: ${WHEN}.`);
    expect(html).toContain("Where: Max&#39;s place");
    expect(html).toContain("Tap <strong>Add to calendar</strong> once.");
    expect(html).toContain('href="https://next-session.link/s/share-token"');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('<a href="https://next-session.link/me"');
  });

  it("escapes what the GM typed", () => {
    const { html } = sessionMailCopy({
      ...halloween,
      groupName: "<script>alert(1)</script>",
      location: 'Bar "&" Grill',
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Bar &quot;&amp;&quot; Grill");
  });
});

it("writes the times in the Group's zone with its city", () => {
  const { text } = sessionMailCopy({
    ...halloween,
    timeZone: "America/New_York",
    window: { start: Date.UTC(2026, 9, 31, 23), end: Date.UTC(2026, 10, 1, 3) },
  });

  expect(firstParagraph(text)).toContain("Saturday, October 31, 2026, 19:00–23:00, New York time.");
});

describe("the mail for entering or leaving the calendar recipient set", () => {
  it.each([
    ["player", `You keep Thursday Crew now, so its session is in your calendar: ${WHEN}.`],
    ["gm", `Thursday Crew is yours now, so its session is in your calendar: ${WHEN}.`],
  ] as const)("invites a %s who entered with the night and the invite hint", (reader, news) => {
    const { subject, text } = sessionMailCopy({ ...halloween, change: "invite", reader });

    expect(subject).toBe("Thursday Crew: next session Saturday, October 31, 2026");
    expect(text.split("\n\n").slice(0, 3)).toEqual([
      `${news}\nWhere: Max's place`,
      "It's in the calendar invite in this mail. Not in your calendar yet? Tap Add to calendar once.",
      "Open your group: https://next-session.link/s/share-token",
    ]);
  });

  it("withdraws the night from a Player who left, with no button to the group", () => {
    const { subject, text, html } = sessionMailCopy({
      change: "withdraw",
      groupName: "Thursday Crew",
      date: "2026-10-31",
    });

    expect(subject).toBe(
      "Thursday Crew: session on Saturday, October 31, 2026 removed from your calendar",
    );
    expect(text).toBe(
      [
        "You don't keep Thursday Crew any more, so its session on Saturday, October 31, 2026 leaves your calendar.",
        "Your calendar removes it by itself. If it doesn't, delete it there.",
        "You get this because you kept this group.\nTurn session emails off in My groups: https://next-session.link/me. Replies to this address aren't read.",
      ].join("\n\n") + "\n",
    );
    expect(html).not.toContain("Open your group");
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});

describe("the mail for a deleted Group's night", () => {
  it.each([
    [
      "player",
      "Thursday Crew was deleted, so its session on Saturday, October 31, 2026 is off.",
      "kept",
    ],
    [
      "gm",
      "You deleted Thursday Crew, so its session on Saturday, October 31, 2026 is off.",
      "ran",
    ],
  ] as const)(
    "tells a %s the night is off, with no button to the gone group",
    (reader, news, why) => {
      const { subject, text, html } = sessionMailCopy({
        change: "deletionCancel",
        reader,
        groupName: "Thursday Crew",
        date: "2026-10-31",
      });

      expect(subject).toBe("Thursday Crew: session on Saturday, October 31, 2026 cancelled");
      expect(text).toBe(
        [
          news,
          "Your calendar removes it by itself. If it doesn't, delete it there.",
          `You get this because you ${why} this group.\nTurn session emails off in My groups: https://next-session.link/me. Replies to this address aren't read.`,
        ].join("\n\n") + "\n",
      );
      expect(html).not.toContain("Open your group");
      expect(html.match(/<a /g)).toHaveLength(1);
    },
  );
});
