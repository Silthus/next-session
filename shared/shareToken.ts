export const SHARE_TOKEN_LENGTH = 10;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export type RandomBytes = (length: number) => Uint8Array;

export function newShareToken(randomBytes: RandomBytes = cryptoRandomBytes): string {
  return Array.from(randomBytes(SHARE_TOKEN_LENGTH), (byte) =>
    ALPHABET.charAt(byte % ALPHABET.length),
  ).join("");
}

function cryptoRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
