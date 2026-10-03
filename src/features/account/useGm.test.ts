import { describe, expect, it } from "vitest";
import { gmStatus } from "./useGm";

const signedIn = { isLoading: false, isAuthenticated: true };

describe("gmStatus", () => {
  it("waits while the auth state or the GM is loading", () => {
    expect(gmStatus({ isLoading: true, isAuthenticated: false }, undefined)).toBe("loading");
    expect(gmStatus(signedIn, undefined)).toBe("loading");
  });

  it("is signed out without a session", () => {
    expect(gmStatus({ isLoading: false, isAuthenticated: false }, null)).toBe("signedOut");
  });

  it("starts over when the session outlived its Anonymous GM", () => {
    expect(gmStatus(signedIn, null)).toBe("signedOut");
  });

  it("tells an Anonymous GM from an Account", () => {
    expect(gmStatus(signedIn, { isAnonymous: true, email: undefined })).toBe("anonymous");
    expect(gmStatus(signedIn, { isAnonymous: false, email: "ada@example.com" })).toBe("account");
  });
});
