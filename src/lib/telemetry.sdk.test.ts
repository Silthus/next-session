import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => {
  const requests: { url: string; body: string }[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: readBody(init?.body) });
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  function readBody(body: unknown): string {
    if (typeof body === "string") return body;
    if (!(body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return "";
    const bytes = Buffer.from(body instanceof ArrayBuffer ? body : body.buffer);
    try {
      return gunzipSync(bytes).toString();
    } catch {
      return bytes.toString();
    }
  }
  return { requests };
});

const shareToken = "AbC9_-xZ12";
const claimCode = "SECRETCODE1";

async function sentEventually(...fragments: string[]) {
  await vi.waitFor(
    () => {
      for (const fragment of fragments) expect(sent()).toContain(fragment);
    },
    { timeout: 10_000, interval: 250 },
  );
}

function sent() {
  return transport.requests.map((request) => `${request.url}\n${request.body}`).join("\n");
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
  window.history.replaceState(null, "", `/s/${shareToken}?code=${claimCode}&month=2026-10`);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("a real posthog-js on a Player page", () => {
  it("sends events, errors and logs to /ingest without the Share Token or the claim code", async () => {
    const telemetry = await import("./telemetry");
    telemetry.initTelemetry({ VITE_POSTHOG_TOKEN: "phc_throwaway", VITE_RELEASE: "abc123" });

    telemetry.track({ name: "answers_started", group_id: "k57abc" });
    telemetry.reportError(new Error(`No group for ${shareToken}`), { surface: "test" });
    telemetry.log("info", "Save resumed", { from: `/s/${shareToken}?code=${claimCode}` });
    window.history.pushState(null, "", `/s/${shareToken}/again?code=${claimCode}`);
    await sentEventually("next_session:answers_started", "$exception", "Save resumed", "/again");

    const everything = sent();
    expect(
      transport.requests.every(({ url }) => url.startsWith(`${location.origin}/ingest/`)),
    ).toBe(true);
    expect(everything).toContain("/s/:shareToken");
    expect(everything).toContain('"product":"next-session"');
    expect(everything).not.toContain(shareToken);
    expect(everything).not.toContain(claimCode);
  });

  it("asks PostHog for no flags and no remote config", () => {
    expect(sent()).not.toMatch(/\/(flags|decide)\//);
    expect(transport.requests.some(({ url }) => url.includes("/array/"))).toBe(false);
  });

  it("stores nothing on the device", () => {
    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
    expect(document.cookie).toBe("");
  });

  it("sends nothing while the visitor has measurement off, and keeps only that choice", async () => {
    const telemetry = await import("./telemetry");
    transport.requests.length = 0;

    telemetry.turnMeasurementOff();
    telemetry.track({ name: "fill_rest_used", group_id: "while-off" });
    telemetry.reportError(new Error("while-off"), { surface: "test" });
    telemetry.log("info", "while-off");
    window.history.pushState(null, "", "/privacy");
    expect(telemetry.measurementIsOn()).toBe(false);
    expect(Object.keys(localStorage)).toEqual(["next-session.measurementOff"]);

    telemetry.turnMeasurementOn();
    telemetry.track({ name: "keep_group_started", group_id: "back-on" });
    await sentEventually("back-on");

    expect(telemetry.measurementIsOn()).toBe(true);
    expect(sent()).not.toContain("while-off");
    expect(Object.keys(localStorage)).toEqual([]);
  });
});
