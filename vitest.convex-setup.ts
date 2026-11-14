import { createHash } from "node:crypto";
import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

let digest: MockInstance<typeof crypto.subtle.digest> | undefined;

// posthog-node hashes each file of a send with crypto.subtle.digest, which settles after any timer
// a faked clock fires meanwhile. Under these tests it settles at once instead.
beforeEach(() => {
  digest = vi.spyOn(crypto.subtle, "digest").mockImplementation((_algorithm, data) => {
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    const hash = createHash("sha256").update(bytes).digest();
    return Promise.resolve(hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength));
  });
});

afterEach(() => {
  digest?.mockRestore();
  digest = undefined;
});
