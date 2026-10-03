import { describe, expect, it } from "vitest";
import { MissingEnvError, readEnv } from "./env";

describe("readEnv", () => {
  it("returns the Convex URL when it is set", () => {
    expect(readEnv({ VITE_CONVEX_URL: "https://happy-otter-1.convex.cloud" })).toEqual({
      convexUrl: "https://happy-otter-1.convex.cloud",
      legal: { controllerAddress: "address on request", contactEmail: "email on request" },
    });
  });

  it("names the missing variable instead of rendering a blank page", () => {
    expect(() => readEnv({})).toThrow(MissingEnvError);
    expect(() => readEnv({ VITE_CONVEX_URL: "" })).toThrow("VITE_CONVEX_URL is not set");
  });

  it("fills the legal controller details from the build environment", () => {
    const env = readEnv({
      VITE_CONVEX_URL: "https://x.convex.cloud",
      LEGAL_CONTROLLER_ADDRESS: "Somewhere 1, 12345 Town",
      LEGAL_CONTACT_EMAIL: "hello@example.test",
    });
    expect(env.legal).toEqual({
      controllerAddress: "Somewhere 1, 12345 Town",
      contactEmail: "hello@example.test",
    });
  });
});
