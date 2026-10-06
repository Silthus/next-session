import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => {
  const requests: { url: string; body: string }[] = [];
  const decoding: Promise<void>[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = { url: input instanceof Request ? input.url : input.toString(), body: "" };
    requests.push(request);
    decoding.push(
      readBody(init?.body).then((body) => {
        request.body = body;
      }),
    );
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  async function readBody(body: unknown): Promise<string> {
    if (typeof body === "string") return body;
    if (!(body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return "";
    const bytes = new Uint8Array(body instanceof ArrayBuffer ? body : body.buffer);
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
    const gunzipped = new Response(bytes.slice()).body!.pipeThrough(
      new DecompressionStream("gzip"),
    );
    return await new Response(gunzipped).text();
  }
  return { requests, decoding };
});

const device = vi.hoisted(() => {
  const cookieWrites: string[] = [];
  const storageKeys: string[] = [];
  const storageWrites: string[] = [];
  type StorageMethod = (this: Storage, ...args: string[]) => unknown;
  for (const name of ["getItem", "setItem", "removeItem"]) {
    const original = Object.getOwnPropertyDescriptor(Storage.prototype, name)!
      .value as StorageMethod;
    const recording: StorageMethod = function (...args) {
      storageKeys.push(args[0]!);
      if (name === "setItem") storageWrites.push(args[0]!);
      return original.apply(this, args);
    };
    Object.defineProperty(Storage.prototype, name, { value: recording });
  }
  Object.defineProperty(document, "referrer", {
    configurable: true,
    get: () => "https://www.bing.com/search?q=tuesday+crew+dnd",
  });
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (value: string) => {
      cookieWrites.push(value);
    },
  });
  return { cookieWrites, storageKeys, storageWrites };
});

const shareToken = "AbC9_-xZ12";
const claimCode = "SECRETCODE1";
const clickId = "CLICKID12345";
const toolbarLink = btoa(JSON.stringify({ action: "ph_authorize", token: "phc_throwaway" }));
const token = { VITE_POSTHOG_TOKEN: "phc_throwaway", VITE_RELEASE: "abc123" };

async function startedTelemetry() {
  const telemetry = await import("./telemetry");
  await telemetry.initTelemetry(token);
  return telemetry;
}

function loadedScripts() {
  return [...document.querySelectorAll("script")].map((script) => script.src);
}

async function sentEventually(...fragments: string[]) {
  await vi.waitFor(
    () => {
      for (const fragment of fragments) expect(sent()).toContain(fragment);
    },
    { timeout: 10_000, interval: 250 },
  );
}

async function everythingDecoded() {
  await Promise.all(transport.decoding);
}

function sent() {
  return transport.requests.map((request) => `${request.url}\n${request.body}`).join("\n");
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
  window.history.replaceState(
    null,
    "",
    `/s/${shareToken}?code=${claimCode}&month=2026-10&utm_source=newsletter&gclid=${clickId}#__posthog=${toolbarLink}`,
  );
});

afterAll(() => {
  vi.useRealTimers();
});

describe("a real posthog-js on a Player page", () => {
  it("sends events, errors and logs to /ingest without the Share Token or the claim code", async () => {
    const telemetry = await startedTelemetry();

    telemetry.track({ name: "answers_started", group_id: "k57abc" });
    telemetry.reportError(new Error(`No group for ${shareToken}`), { surface: "test" });
    telemetry.log("info", "Save resumed", { from: `/s/${shareToken}?code=${claimCode}` });
    window.history.pushState(null, "", `/s/${shareToken}/again?code=${claimCode}`);
    await sentEventually("next_session:answers_started", "$exception", "Save resumed", "/again");
    await everythingDecoded();

    const everything = sent();
    expect(
      transport.requests.every(({ url }) => url.startsWith(`${location.origin}/ingest/`)),
    ).toBe(true);
    expect(everything).toContain("/s/:shareToken");
    expect(everything).toContain('"product":"next-session"');
    expect(everything).not.toContain(shareToken);
    expect(everything).not.toContain(claimCode);
    expect(everything).not.toContain(clickId);
    expect(everything).not.toMatch(/utm_|gclid/);
    expect(everything).not.toMatch(/tuesday|ph_keyword/);
    expect(everything).not.toMatch(/\/(flags|decide)\//);
  });

  it("keeps nothing of its own on the device, even from a toolbar link", async () => {
    await startedTelemetry();

    const posthogWrites = device.storageWrites.filter((key) => !key.startsWith("next-session."));
    expect(new Set(posthogWrites)).toEqual(new Set(["__mplssupport__"]));
    expect(Object.keys(localStorage).filter((key) => !key.startsWith("next-session."))).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
    expect(device.storageKeys).not.toContain("_postHogToolbarParams");
    expect(device.cookieWrites).toEqual([]);
    expect(loadedScripts().filter((src) => /toolbar|\/array\//.test(src))).toEqual([]);
  });

  it("sends nothing while the visitor has measurement off, and keeps only that choice", async () => {
    const telemetry = await startedTelemetry();
    transport.requests.length = 0;

    telemetry.turnMeasurementOff();
    telemetry.track({ name: "fill_rest_used", group_id: "while-off" });
    telemetry.reportError(new Error("while-off"), { surface: "test" });
    telemetry.log("info", "while-off");
    window.history.pushState(null, "", "/privacy");
    expect(telemetry.measurementIsOn()).toBe(false);
    expect(Object.keys(localStorage)).toEqual(["next-session.measurementOff"]);

    await telemetry.turnMeasurementOn();
    telemetry.track({ name: "keep_group_started", group_id: "back-on" });
    await sentEventually("back-on");
    await everythingDecoded();

    expect(telemetry.measurementIsOn()).toBe(true);
    expect(sent()).not.toContain("while-off");
    expect(Object.keys(localStorage)).toEqual([]);
  });
});
