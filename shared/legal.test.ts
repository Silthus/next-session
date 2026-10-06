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
