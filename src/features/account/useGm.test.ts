import type { AuthTokenFetcher } from "convex/browser";
import { describe, expect, it, vi } from "vitest";
import { gmStatus, signInSwitchingIdentity } from "./useGm";

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

type OnChange = (isAuthenticated: boolean) => void;

function fakeClient() {
  const steps: string[] = [];
  let confirm: OnChange = () => undefined;
  return {
    steps,
    confirm: (isAuthenticated: boolean) => confirm(isAuthenticated),
    client: {
      setAuth: (fetchToken: AuthTokenFetcher, onChange?: OnChange) => {
        steps.push(`setAuth ${fetchToken === latestToken ? "latest token" : "other"}`);
        confirm = onChange ?? confirm;
      },
    },
  };
}

const latestToken: AuthTokenFetcher = () => Promise.resolve("account-jwt");

describe("signInSwitchingIdentity", () => {
  it("moves the live connection to the new identity and waits for the server to confirm it", async () => {
    const { client, steps, confirm } = fakeClient();
    const signIn = () => {
      steps.push("signIn");
      return Promise.resolve();
    };

    const switched = signInSwitchingIdentity(signIn, {
      client,
      fetchAccessToken: latestToken,
      isAuthenticated: true,
    });
    await vi.waitFor(() => expect(steps).toEqual(["signIn", "setAuth latest token"]));
    let settled = false;
    void switched.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    confirm(true);

    await switched;
  });

  it("fails when the server refuses the new identity", async () => {
    const { client, steps, confirm } = fakeClient();

    const switched = signInSwitchingIdentity(() => Promise.resolve(), {
      client,
      fetchAccessToken: latestToken,
      isAuthenticated: true,
    });
    await vi.waitFor(() => expect(steps).toEqual(["setAuth latest token"]));
    confirm(false);

    await expect(switched).rejects.toThrow();
  });

  it("settles overlapping switches one after the other", async () => {
    const { client, steps, confirm } = fakeClient();
    const session = { client, fetchAccessToken: latestToken, isAuthenticated: true };

    const first = signInSwitchingIdentity(() => Promise.resolve(), session);
    const second = signInSwitchingIdentity(() => Promise.resolve(), session);
    await vi.waitFor(() => expect(steps).toHaveLength(1));
    confirm(true);
    await first;
    await vi.waitFor(() => expect(steps).toHaveLength(2));
    confirm(true);

    await second;
  });

  it("leaves a first sign-in to the auth provider", async () => {
    const { client, steps } = fakeClient();

    await signInSwitchingIdentity(() => Promise.resolve(), {
      client,
      fetchAccessToken: latestToken,
      isAuthenticated: false,
    });

    expect(steps).toEqual([]);
  });
});
