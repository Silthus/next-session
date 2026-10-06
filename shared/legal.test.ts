import { describe, expect, it } from "vitest";
import privacy from "../docs/legal/privacy.md?raw";
import terms from "../docs/legal/terms.md?raw";
import { LEGAL_VERSIONS } from "./legal";

const texts = { terms, privacy };

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
});
