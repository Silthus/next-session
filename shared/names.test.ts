import { describe, expect, it } from "vitest";
import { normalizeName } from "./names";

describe("normalizeName", () => {
  it("trims the name and collapses inner whitespace", () => {
    expect(normalizeName("  Ana \t  Lima \n")).toEqual({ name: "Ana Lima", nameKey: "ana lima" });
  });

  it("gives names that differ only in case the same key", () => {
    expect(normalizeName("ANA")).toMatchObject({ nameKey: "ana" });
    expect(normalizeName("ana")).toMatchObject({ nameKey: "ana" });
  });

  it("gives the same name typed with composed or decomposed accents the same key", () => {
    const composed = normalizeName("Zoë");
    const decomposed = normalizeName("Zoë");
    expect(decomposed).toEqual(composed);
  });

  it("rejects a blank name", () => {
    expect(normalizeName("")).toBe("INVALID_NAME");
    expect(normalizeName("   \t")).toBe("INVALID_NAME");
  });

  it("accepts 60 characters and rejects 61", () => {
    expect(normalizeName("a".repeat(60))).toMatchObject({ name: "a".repeat(60) });
    expect(normalizeName("a".repeat(61))).toBe("INVALID_NAME");
  });

  it("counts an emoji as one character", () => {
    expect(normalizeName("🎲".repeat(60))).toMatchObject({ name: "🎲".repeat(60) });
  });
});
