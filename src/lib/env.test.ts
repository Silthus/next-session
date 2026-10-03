import { describe, expect, it } from "vitest";
import { convexUrl, legalContact, MissingEnvError } from "./env";

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
