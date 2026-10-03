import { describe, expect, it } from "vitest";
import { newShareToken } from "./shareToken";

const bytes =
  (...values: number[]) =>
  () =>
    Uint8Array.from(values);

describe("newShareToken", () => {
  it("spells ten random bytes in the URL-safe alphabet A-Z a-z 0-9 _ -", () => {
    expect(newShareToken(bytes(0, 25, 26, 51, 52, 61, 62, 63, 0, 0))).toBe("AZaz09_-AA");
  });

  it("uses all eight bits of a byte evenly, since 256 is a multiple of 64", () => {
    expect(newShareToken(bytes(64, 128, 192, 255, 0, 0, 0, 0, 0, 0))).toBe("AAA-AAAAAA");
  });

  it("is 10 characters, so it never looks like an 8-character legacy Lonir token", () => {
    expect(newShareToken()).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });

  it("is unguessable: fresh tokens do not repeat", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newShareToken()));
    expect(tokens.size).toBe(1000);
  });
});
