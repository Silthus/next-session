import type { CaptureLogOptions, CaptureResult, PostHogConfig } from "posthog-js/dist/module.slim";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStorage } from "./storage";
import { redactEvent, redactLog, redactUrl } from "./telemetry";

const pageUrl = "https://next-session.link/s/AbC9_-xZ12?code=SECRETCODE1&month=2026-10";

async function freshTelemetry() {
  vi.resetModules();
  return await import("./telemetry");
}

function memoryStorage(entries: Record<string, string> = {}): KeyValueStorage & {
  entries: Record<string, string>;
} {
  return {
    entries,
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => {
      entries[key] = value;
    },
    removeItem: (key) => {
      delete entries[key];
    },
  };
}

function fakePostHog() {
  const instance = {
    register: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const init = vi.fn<(token: string, config: Partial<PostHogConfig>) => typeof instance>(
    () => instance,
  );
  const load = vi.fn(() => Promise.resolve({ init }));
  return { load, init, instance };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function event(name: string, properties: Record<string, unknown>): CaptureResult {
  return { uuid: "e1", event: name, properties };
}

describe("redactUrl", () => {
  it.each([
    ["/s/AbC9_-xZ12", "/s/:shareToken"],
    ["/s/AbC9_-xZ12/", "/s/:shareToken/"],
    [
      "https://next-session.link/s/AbC9_-xZ12?code=SECRETCODE1&month=2026-10&day=2026-10-12#join",
      "https://next-session.link/s/:shareToken?month=2026-10&day=2026-10-12",
    ],
    ["https://next-session.link/tips?code=abc123", "https://next-session.link/tips"],
    ["/?code=oauth-code&state=xyz", "/"],
    ["/g/k57abc123?month=2026-11", "/g/k57abc123?month=2026-11"],
    ["https://next-session.link/privacy", "https://next-session.link/privacy"],
    ["https://www.google.com/url?q=next-session.link/s/AbC9_-xZ12", "https://www.google.com/url"],
    ["/S/AbC9_-xZ12?code=SECRETCODE1", "/s/:shareToken"],
    ["https://next-session.link/S/AbC9_-xZ12", "https://next-session.link/s/:shareToken"],
  ])("turns %s into %s", (url, redacted) => {
    expect(redactUrl(url)).toBe(redacted);
  });

  it("leaves strings that are not URLs alone", () => {
    expect(redactUrl("$direct")).toBe("$direct");
    expect(redactUrl("Tuesday crew")).toBe("Tuesday crew");
  });
});

describe("redactEvent", () => {
  it("redacts every URL and path the SDK attaches", () => {
    const pageview: CaptureResult = {
      ...event("$pageview", {
        $current_url: pageUrl,
        $pathname: "/s/AbC9_-xZ12",
        $referrer: "https://next-session.link/s/AbC9_-xZ12?code=SECRETCODE1",
        $session_entry_url: pageUrl,
        $prev_pageview_pathname: "/s/AbC9_-xZ12",
        $host: "next-session.link",
      }),
      $set_once: { $initial_current_url: pageUrl, $initial_pathname: "/s/AbC9_-xZ12" },
    };

    const redacted = redactEvent(pageview, pageUrl);

    expect(redacted?.properties).toMatchObject({
      $current_url: "https://next-session.link/s/:shareToken?month=2026-10",
      $pathname: "/s/:shareToken",
      $referrer: "https://next-session.link/s/:shareToken",
      $session_entry_url: "https://next-session.link/s/:shareToken?month=2026-10",
      $prev_pageview_pathname: "/s/:shareToken",
      $host: "next-session.link",
    });
    expect(redacted?.$set_once).toEqual({
      $initial_current_url: "https://next-session.link/s/:shareToken?month=2026-10",
      $initial_pathname: "/s/:shareToken",
    });
  });

  it("drops what the SDK reads from the device, the page title and the search keyword", () => {
    const deviceReads = {
      $screen_height: 800,
      $screen_width: 400,
      $viewport_height: 700,
      $viewport_width: 400,
      $timezone: "Europe/Berlin",
      $timezone_offset: -120,
      $browser_language: "de-DE",
      $browser_language_prefix: "de",
      title: "Tuesday crew · Next Session",
      ph_keyword: "tuesday crew dnd",
    };
    const pageview: CaptureResult = {
      ...event("$pageview", { ...deviceReads, $browser: "Firefox", $os: "Android" }),
      $set_once: { $initial_timezone: "Europe/Berlin", $initial_browser_language: "de-DE" },
    };

    const redacted = redactEvent(pageview, pageUrl);

    expect(redacted?.properties).toEqual({ $browser: "Firefox", $os: "Android" });
    expect(redacted?.$set_once).toEqual({});
  });

  it("scrubs the page's Share Token and query values out of exception messages and frames", () => {
    const exception = event("$exception", {
      $exception_list: [
        {
          type: "Error",
          value: 'Value: "AbC9_-xZ12" with code SECRETCODE1 at /s/AbC9_-xZ12',
          stacktrace: {
            frames: [
              { filename: "https://next-session.link/assets/index-abc.js", lineno: 1 },
              { filename: "https://next-session.link/s/AbC9_-xZ12", lineno: 2 },
            ],
          },
        },
      ],
    });

    const serialized = JSON.stringify(redactEvent(exception, pageUrl));

    expect(serialized).not.toContain("AbC9_-xZ12");
    expect(serialized).not.toContain("SECRETCODE1");
    expect(serialized).toContain("https://next-session.link/assets/index-abc.js");
    expect(serialized).toContain('Value: \\":shareToken\\" with code :redacted at /s/:shareToken');
  });

  it("scrubs the Tips confirmation code out of an exception on /tips", () => {
    const exception = event("$exception", {
      $exception_list: [{ value: "failed with TIPSCODE123" }],
    });

    const serialized = JSON.stringify(
      redactEvent(exception, "https://next-session.link/tips?confirm=TIPSCODE123"),
    );

    expect(serialized).not.toContain("TIPSCODE123");
  });

  it("scrubs a Share Token typed with a capital S", () => {
    const exception = event("$exception", {
      $exception_list: [{ value: "failed at /S/AbC9_-xZ12" }],
    });

    const serialized = JSON.stringify(
      redactEvent(exception, "https://next-session.link/S/AbC9_-xZ12"),
    );

    expect(serialized).not.toContain("AbC9_-xZ12");
  });

  it("keeps ordinary query values intact elsewhere in the event", () => {
    const pageview = event("$pageview", {
      $referrer: "https://www.google.com/",
      $referring_domain: "www.google.com",
      product: "next-session",
    });

    const redacted = redactEvent(
      pageview,
      "https://next-session.link/?utm_source=google&utm_campaign=session",
    );

    expect(redacted?.properties).toEqual(pageview.properties);
  });

  it.each(["$pageview", "$exception", "next_session:answers_started"])("sends %s", (name) => {
    expect(redactEvent(event(name, {}), pageUrl)?.event).toBe(name);
  });

  it.each(["$autocapture", "$rageclick", "$dead_click", "$$heatmap", "$web_vitals", "$identify"])(
    "drops %s, which Next Session never measures",
    (name) => {
      expect(redactEvent(event(name, {}), pageUrl)).toBeNull();
    },
  );

  it("passes a dropped event on as dropped", () => {
    expect(redactEvent(null, pageUrl)).toBeNull();
  });
});

describe("redactLog", () => {
  it("replaces the page URL the SDK adds after this filter runs", () => {
    const record = redactLog({ body: "Save resumed", level: "info" }, pageUrl);

    expect(record.attributes?.["url.full"]).toBe(
      "https://next-session.link/s/:shareToken?month=2026-10",
    );
  });

  it("redacts URL attributes and scrubs the body", () => {
    const record = redactLog(
      {
        body: "Claim failed for AbC9_-xZ12",
        level: "warn",
        attributes: { referrer: "/s/AbC9_-xZ12?code=SECRETCODE1", code: "CLAIM_INVALID", count: 2 },
      },
      pageUrl,
    );

    expect(record).toEqual({
      body: "Claim failed for :shareToken",
      level: "warn",
      attributes: {
        "url.full": "https://next-session.link/s/:shareToken?month=2026-10",
        referrer: "/s/:shareToken",
        code: "CLAIM_INVALID",
        count: 2,
      },
    });
  });
});

describe("initTelemetry", () => {
  it("does nothing without a token, and every export stays a no-op", async () => {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();

    await telemetry.initTelemetry({}, posthog.load, memoryStorage());
    telemetry.track({ name: "save_started" });
    telemetry.log("info", "Save resumed");
    telemetry.reportError(new Error("boom"), { surface: "root" });

    expect(posthog.load).not.toHaveBeenCalled();
  });

  it("starts PostHog cookieless through /ingest, with the Product Marker and no flags", async () => {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();

    await telemetry.initTelemetry(
      { VITE_POSTHOG_TOKEN: "phc_test", VITE_RELEASE: "abc123" },
      posthog.load,
      memoryStorage(),
    );

    expect(posthog.init).toHaveBeenCalledOnce();
    const [token, config] = posthog.init.mock.calls[0]!;
    expect(token).toBe("phc_test");
    expect(config).toMatchObject({
      api_host: `${window.location.origin}/ingest`,
      ui_host: "https://eu.posthog.com",
      defaults: "2026-08-29",
      cookieless_mode: "always",
      person_profiles: "never",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: false,
      capture_exceptions: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_scroll_properties: true,
      save_campaign_params: false,
      persistence: "memory",
      advanced_disable_flags: true,
      logs: {
        serviceName: "next-session-web",
        environment: "production",
        serviceVersion: "abc123",
        resourceAttributes: { product: "next-session" },
      },
    });
    expect(config.before_send).toBeTypeOf("function");
    expect(config.logs?.beforeSend).toBeTypeOf("function");
    expect(posthog.instance.register).toHaveBeenCalledWith({ product: "next-session" });
  });

  it("starts once however often it is called", async () => {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();
    const source = { VITE_POSTHOG_TOKEN: "phc_test" };

    await Promise.all([
      telemetry.initTelemetry(source, posthog.load, memoryStorage()),
      telemetry.initTelemetry(source, posthog.load, memoryStorage()),
    ]);
    await telemetry.initTelemetry(source, posthog.load, memoryStorage());

    expect(posthog.load).toHaveBeenCalledOnce();
    expect(posthog.init).toHaveBeenCalledOnce();
  });

  it("stays off in a browser that turned measurement off", async () => {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();
    const storage = memoryStorage();
    telemetry.turnMeasurementOff(storage);

    await telemetry.initTelemetry({ VITE_POSTHOG_TOKEN: "phc_test" }, posthog.load, storage);

    expect(posthog.load).not.toHaveBeenCalled();
    expect(telemetry.measurementIsOn(storage)).toBe(false);
  });

  it("stays quiet after an opt-out in a browser that cannot store the choice", async () => {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();
    const blockedStorage: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => undefined,
    };
    await telemetry.initTelemetry({ VITE_POSTHOG_TOKEN: "phc_test" }, posthog.load, blockedStorage);
    const config = posthog.init.mock.calls[0]![1];

    telemetry.turnMeasurementOff(blockedStorage);

    expect(telemetry.measurementIsOn(blockedStorage)).toBe(false);
    expect(config.before_send).toBeTypeOf("function");
    const beforeSend = config.before_send as (event: CaptureResult) => CaptureResult | null;
    expect(beforeSend(event("$pageview", {}))).toBeNull();
    expect(config.logs?.beforeSend).toBeTypeOf("function");
    const beforeSendLog = config.logs!.beforeSend as (
      record: CaptureLogOptions,
    ) => CaptureLogOptions | null;
    expect(beforeSendLog({ body: "after opt-out" })).toBeNull();
  });

  it("keeps the opt-out for this visit and says so when the browser refuses localStorage", async () => {
    const telemetry = await freshTelemetry();
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(telemetry.turnMeasurementOff()).toEqual({ remembered: false });
    expect(telemetry.measurementIsOn()).toBe(false);
  });

  it("honours an opt-out made in another tab after this one turned measurement back on", async () => {
    const telemetry = await freshTelemetry();
    const sharedStorage = memoryStorage();
    vi.stubGlobal("localStorage", sharedStorage);
    await telemetry.turnMeasurementOn();

    sharedStorage.setItem("next-session.measurementOff", "1");

    expect(telemetry.measurementIsOn(sharedStorage)).toBe(false);
  });

  it("delivers what the page sent while PostHog was still loading", async () => {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();

    const starting = telemetry.initTelemetry(
      { VITE_POSTHOG_TOKEN: "phc_test" },
      posthog.load,
      memoryStorage(),
    );
    telemetry.track({ name: "save_started" });
    telemetry.log("info", "Save resumed");
    await starting;

    expect(posthog.instance.capture).toHaveBeenCalledWith("next_session:save_started", {});
    expect(posthog.instance.logger.info).toHaveBeenCalledWith("Save resumed", undefined);
  });
});

describe("track, log and reportError", () => {
  async function started() {
    const telemetry = await freshTelemetry();
    const posthog = fakePostHog();
    await telemetry.initTelemetry(
      { VITE_POSTHOG_TOKEN: "phc_test" },
      posthog.load,
      memoryStorage(),
    );
    return { telemetry, instance: posthog.instance };
  }

  it("sends a browser event under the next_session: prefix", async () => {
    const { telemetry, instance } = await started();

    telemetry.track({ name: "fill_rest_used", group_id: "k57abc" });

    expect(instance.capture).toHaveBeenCalledWith("next_session:fill_rest_used", {
      group_id: "k57abc",
    });
  });

  it("logs through the PostHog logger", async () => {
    const { telemetry, instance } = await started();

    telemetry.log("warn", "Claim invalid", { code: "CLAIM_INVALID" });

    expect(instance.logger.warn).toHaveBeenCalledWith("Claim invalid", { code: "CLAIM_INVALID" });
  });

  it.each([
    ["onCaughtError", "react-caught"],
    ["onUncaughtError", "react-uncaught"],
  ] as const)("reports what React hands to %s", async (callback, surface) => {
    const { telemetry, instance } = await started();
    const error = new Error("boom");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    telemetry.reactErrorReporting[callback](error, { componentStack: "" });

    expect(instance.captureException).toHaveBeenCalledWith(error, { surface });
    expect(console.error).toHaveBeenCalledWith(error);
  });
});
