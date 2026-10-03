import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalArticle } from "./LegalArticle";
import { parseLegalDocument } from "./legalDocument";

const markdown = `# Privacy Policy

> Draft.

**Version 1.0. Effective: {{EFFECTIVE_DATE}}**

This policy explains what we process.

## 1. Controller

Michael Reichenbach
{{CONTROLLER_ADDRESS}}
{{CONTACT_EMAIL}}

## 2. Recipients

| Processor | Purpose |
| --- | --- |
| Convex, Inc. | Database |

- one
- two

See the [Terms](/terms) and <https://www.lda.bayern.de>.
`;

describe("LegalArticle", () => {
  it("renders the document as one article with the effective date, headings, tables and links", () => {
    const document = parseLegalDocument(markdown, {
      EFFECTIVE_DATE: "2026-11-01",
      CONTROLLER_ADDRESS: "address on request",
      CONTACT_EMAIL: "email on request",
    });
    render(<LegalArticle document={document} />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeTruthy();
    expect(screen.getByText("Updated 2026-11-01")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "1. Controller",
      "2. Recipients",
    ]);
    expect(screen.getByText(/address on request/).textContent).toContain("Michael Reichenbach");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Convex, Inc." })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "https://www.lda.bayern.de" })).toHaveProperty(
      "href",
      "https://www.lda.bayern.de/",
    );
  });
});
