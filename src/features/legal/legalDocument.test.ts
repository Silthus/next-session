import { describe, expect, it } from "vitest";
import { parseLegalDocument } from "./legalDocument";

const placeholders = {
  EFFECTIVE_DATE: "2026-11-01",
  CONTROLLER_ADDRESS: "Somewhere 1, 12345 Town",
  CONTACT_EMAIL: "hello@example.test",
};

const terms = `# Terms of Use

> **Draft, pending review.** Source text for the page.

**Version 1.0. Effective: {{EFFECTIVE_DATE}}**

These Terms are provided by Michael Reichenbach, {{CONTROLLER_ADDRESS}}. See the [Imprint](/imprint).

## 1. Acceptance

You accept these Terms when you click **Create your link**.
Write to {{CONTACT_EMAIL}} or <https://www.lda.bayern.de>.

## 2. Storage

The Service stores:

- your sign-in tokens;
- which player you are.

| Data | Retention |
| --- | --- |
| A group | 30 days |
| An account | Until you ask |
`;

describe("parseLegalDocument", () => {
  const doc = parseLegalDocument(terms, placeholders);

  it("reads the title and the version line as the effective date", () => {
    expect(doc.title).toBe("Terms of Use");
    expect(doc.effectiveDate).toBe("2026-11-01");
  });

  it("drops editorial blockquotes and keeps the intro with placeholders filled", () => {
    expect(doc.intro).toEqual([
      {
        kind: "paragraph",
        lines: [
          [
            {
              kind: "text",
              text: "These Terms are provided by Michael Reichenbach, Somewhere 1, 12345 Town. See the ",
            },
            { kind: "link", href: "/imprint", text: "Imprint" },
            { kind: "text", text: "." },
          ],
        ],
      },
    ]);
  });

  it("splits sections at level-two headings with bold, autolinks and line breaks", () => {
    expect(doc.sections.map((section) => section.heading)).toEqual(["1. Acceptance", "2. Storage"]);
    expect(doc.sections[0]?.blocks).toEqual([
      {
        kind: "paragraph",
        lines: [
          [
            { kind: "text", text: "You accept these Terms when you click " },
            { kind: "strong", text: "Create your link" },
            { kind: "text", text: "." },
          ],
          [
            { kind: "text", text: "Write to hello@example.test or " },
            { kind: "link", href: "https://www.lda.bayern.de", text: "https://www.lda.bayern.de" },
            { kind: "text", text: "." },
          ],
        ],
      },
    ]);
  });

  it("parses lists and tables", () => {
    expect(doc.sections[1]?.blocks).toEqual([
      { kind: "paragraph", lines: [[{ kind: "text", text: "The Service stores:" }]] },
      {
        kind: "list",
        items: [
          [{ kind: "text", text: "your sign-in tokens;" }],
          [{ kind: "text", text: "which player you are." }],
        ],
      },
      {
        kind: "table",
        header: [[{ kind: "text", text: "Data" }], [{ kind: "text", text: "Retention" }]],
        rows: [
          [[{ kind: "text", text: "A group" }], [{ kind: "text", text: "30 days" }]],
          [[{ kind: "text", text: "An account" }], [{ kind: "text", text: "Until you ask" }]],
        ],
      },
    ]);
  });

  it("keeps body text that follows a heading without a blank line", () => {
    const doc = parseLegalDocument("# T\n## 1. One\nBody line.\n", placeholders);
    expect(doc.sections).toEqual([
      {
        heading: "1. One",
        blocks: [{ kind: "paragraph", lines: [[{ kind: "text", text: "Body line." }]] }],
      },
    ]);
  });

  it("reads tables without boundary pipes", () => {
    const doc = parseLegalDocument(
      "# T\n\nData | Retention\n--- | ---\nA group | 30 days\n",
      placeholders,
    );
    expect(doc.intro).toEqual([
      {
        kind: "table",
        header: [[{ kind: "text", text: "Data" }], [{ kind: "text", text: "Retention" }]],
        rows: [[[{ kind: "text", text: "A group" }], [{ kind: "text", text: "30 days" }]]],
      },
    ]);
  });

  it("fills a placeholder written with spaces inside the braces", () => {
    const doc = parseLegalDocument("# T\n\nWrite to {{ CONTACT_EMAIL }}.\n", placeholders);
    expect(doc.intro).toEqual([
      { kind: "paragraph", lines: [[{ kind: "text", text: "Write to hello@example.test." }]] },
    ]);
  });

  it("refuses a placeholder it cannot fill", () => {
    expect(() => parseLegalDocument("# T\n\nWrite to {{CONTACT_EMIAL}}.\n", placeholders)).toThrow(
      "Unknown legal placeholder CONTACT_EMIAL",
    );
  });

  it("has no effective date when the document carries no version line", () => {
    const imprint = parseLegalDocument(
      "# Imprint\n\nInformation according to § 5 DDG.\n\n## Provider\n\nMichael Reichenbach\n{{CONTROLLER_ADDRESS}}\n",
      placeholders,
    );
    expect(imprint.effectiveDate).toBeNull();
    expect(imprint.sections[0]?.blocks).toEqual([
      {
        kind: "paragraph",
        lines: [
          [{ kind: "text", text: "Michael Reichenbach" }],
          [{ kind: "text", text: "Somewhere 1, 12345 Town" }],
        ],
      },
    ]);
  });
});
