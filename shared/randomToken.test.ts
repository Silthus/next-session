import { afterEach, describe, expect, it, vi } from "vitest";
import { randomToken, SHARE_TOKEN_LENGTH } from "./randomToken";

const bytes =
  (...values: number[]) =>
  () =>
    Uint8Array.from(values);

describe("randomToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spells random bytes in the URL-safe alphabet A-Z a-z 0-9 _ -", () => {
    expect(randomToken(10, bytes(0, 25, 26, 51, 52, 61, 62, 63, 0, 0))).toBe("AZaz09_-AA");
  });

  it("uses all eight bits of a byte evenly, since 256 is a multiple of 64", () => {
    expect(randomToken(4, bytes(64, 128, 192, 255))).toBe("AAA-");
  });

  it.each([10, 22])("draws %i bytes for a token of that length", (length) => {
    const randomBytes = vi.fn((count: number) => new Uint8Array(count));

    expect(randomToken(length, randomBytes)).toBe("A".repeat(length));
    expect(randomBytes).toHaveBeenCalledWith(length);
  });

  it("draws its bytes from the cryptographic random source", () => {
    const getRandomValues = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      return array;
    });
    expect(randomToken(10)).toBe("BCDEFGHIJK");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});

describe("a Share Token", () => {
  it("is 10 characters, so it never looks like an 8-character legacy Lonir token", () => {
    expect(randomToken(SHARE_TOKEN_LENGTH)).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });
});
