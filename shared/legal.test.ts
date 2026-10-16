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
});
