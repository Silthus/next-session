import { describe, expect, it } from "vitest";
import { shareLinkUrl } from "./shareLink";

const link = { origin: "https://next-session.link", shareToken: "k3Qx9Lm2aB", today: "2026-10-11" };

describe("shareLinkUrl", () => {
  it("opens the Share Link on the month the GM is looking at", () => {
    expect(shareLinkUrl({ ...link, month: "2026-11" })).toBe(
      "https://next-session.link/s/k3Qx9Lm2aB?month=2026-11",
    );
  });

  it("carries the current month when the GM looks at it", () => {
    expect(shareLinkUrl({ ...link, month: "2026-10" })).toBe(
      "https://next-session.link/s/k3Qx9Lm2aB?month=2026-10",
    );
  });

  it("sends players to the current month instead of a past one they cannot answer", () => {
    expect(shareLinkUrl({ ...link, month: "2026-08" })).toBe(
      "https://next-session.link/s/k3Qx9Lm2aB?month=2026-10",
    );
  });
});
