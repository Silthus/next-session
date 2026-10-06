import { describe, expect, it } from "vitest";
import { convexUrl, legalContact, MissingEnvError, postHogEnv } from "./env";

describe("convexUrl", () => {
  it("returns the Convex URL when it is set", () => {
    expect(convexUrl({ VITE_CONVEX_URL: "https://happy-otter-1.convex.cloud" })).toBe(
      "https://happy-otter-1.convex.cloud",
    );
  });

  it("names the missing variable instead of rendering a blank page", () => {
    expect(() => convexUrl({})).toThrow(MissingEnvError);
    expect(() => convexUrl({ VITE_CONVEX_URL: "" })).toThrow("VITE_CONVEX_URL is not set");
  });
});

describe("legalContact", () => {
  it("falls back to on-request wording for a local build", () => {
    expect(legalContact({})).toEqual({
      controllerAddress: "address on request",
      contactEmail: "email on request",
    });
  });

  it("fills the controller details from the build variables the spec names", () => {
    expect(
      legalContact({
        LEGAL_CONTROLLER_ADDRESS: "Somewhere 1, 12345 Town",
        LEGAL_CONTACT_EMAIL: "hello@example.test",
      }),
    ).toEqual({ controllerAddress: "Somewhere 1, 12345 Town", contactEmail: "hello@example.test" });
  });
});

describe("postHogEnv", () => {
  it("is absent without a token, so measurement stays off", () => {
    expect(postHogEnv({})).toBeNull();
    expect(postHogEnv({ VITE_POSTHOG_TOKEN: "", VITE_RELEASE: "abc123" })).toBeNull();
  });

  it("carries the token and the release the build was made from", () => {
    expect(postHogEnv({ VITE_POSTHOG_TOKEN: "phc_test", VITE_RELEASE: "abc123" })).toEqual({
      token: "phc_test",
      release: "abc123",
    });
  });
});
