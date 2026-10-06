import type {
  CaptureLogOptions,
  CaptureResult,
  PostHog,
  PostHogConfig,
  Properties,
} from "posthog-js";
import type { KeyValueStorage } from "./storage";

export type BrowserEvent =
  | {
      name: "share_link_copied";
      surface: "landing" | "rail" | "compact";
      method: "clipboard" | "fallback" | "failed";
    }
  | {
      name: "share_link_shared";
      surface: "landing" | "rail" | "compact";
      channel: "whatsapp" | "telegram" | "mail" | "native";
    }
  | { name: "fill_rest_used"; group_id: string }
  | { name: "answers_started"; group_id: string }
  | { name: "save_started" }
  | { name: "sign_in_failed"; flow: "signUp" | "signIn"; code: string }
  | { name: "keep_group_started"; group_id: string };

export type LogLevel = "info" | "warn" | "error";
type LogAttributes = Record<string, string | number | boolean>;
type EnvSource = Record<string, string | undefined>;
type ActiveClient = Pick<PostHog, "register" | "capture" | "captureException"> & {
  logger: Pick<PostHog["logger"], LogLevel>;
};
export type TelemetryClient = {
  init(token: string, config: Partial<PostHogConfig>): ActiveClient | undefined;
};
export type LoadPostHog = () => Promise<TelemetryClient>;
type ClientCall = (client: ActiveClient) => void;

const PRODUCT = "next-session";
const EVENT_PREFIX = "next_session:";
const SENT_SDK_EVENTS = new Set(["$pageview", "$exception"]);
const MEASUREMENT_OFF_KEY = "next-session.measurementOff";
const KEPT_QUERY_KEYS = ["month", "day"];
const SHARE_TOKEN = ":shareToken";
const REDACTED = ":redacted";
const SHARE_TOKEN_PATH = /^\/s\/[^/]+/;
const SHARE_TOKEN_PATH_IN_TEXT = /\/s\/[A-Za-z0-9_-]+/g;
const SHORTEST_SCRUBBED_SECRET = 6;
const DROPPED_PROPERTIES = new Set([
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$timezone",
  "$timezone_offset",
  "$browser_language",
  "$browser_language_prefix",
  "title",
]);

type Secret = { value: string; placeholder: string };

const loadPostHog: LoadPostHog = async () => (await import("posthog-js")).default;

let client: ActiveClient | null = null;
let starting: Promise<void> | null = null;
let waitingCalls: ClientCall[] | null = null;
const reportedErrors = new WeakSet<object>();

export function initTelemetry(
  source: EnvSource = import.meta.env,
  load: LoadPostHog = loadPostHog,
  storage: KeyValueStorage = browserStorage(),
): Promise<void> {
  const token = source.VITE_POSTHOG_TOKEN;
  if (!token || !measurementIsOn(storage)) return Promise.resolve();
  starting ??= start(load, token, source.VITE_RELEASE, storage);
  return starting;
}

export function track(event: BrowserEvent): void {
  const { name, ...properties } = event;
  withClient((active) => active.capture(`${EVENT_PREFIX}${name}`, properties));
}

export function log(level: LogLevel, body: string, attributes?: LogAttributes): void {
  withClient((active) => active.logger[level](body, attributes));
}

export function reportError(error: unknown, context: { surface: string }): void {
  if (alreadyReported(error)) return;
  withClient((active) => active.captureException(error, context));
}

export function measurementAvailable(source: EnvSource = import.meta.env): boolean {
  return Boolean(source.VITE_POSTHOG_TOKEN);
}

export function measurementIsOn(storage: KeyValueStorage = browserStorage()): boolean {
  return attempt(() => storage.getItem(MEASUREMENT_OFF_KEY), null) === null;
}

export function turnMeasurementOff(storage: KeyValueStorage = browserStorage()): void {
  attempt(() => storage.setItem(MEASUREMENT_OFF_KEY, "1"), undefined);
}

export function turnMeasurementOn(storage: KeyValueStorage = browserStorage()): Promise<void> {
  attempt(() => storage.removeItem(MEASUREMENT_OFF_KEY), undefined);
  return initTelemetry(import.meta.env, loadPostHog, storage);
}

export function redactUrl(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return url;
  const path = parsed.url.pathname.replace(SHARE_TOKEN_PATH, `/s/${SHARE_TOKEN}`);
  const query = keptQuery(parsed.url.searchParams);
  return `${parsed.absolute ? parsed.url.origin : ""}${path}${query}`;
}

export function redactEvent(event: CaptureResult | null, currentUrl: string): CaptureResult | null {
  if (!event || !isMeasured(event.event)) return null;
  const secrets = secretsIn(currentUrl);
  return {
    ...event,
    properties: redactProperties(event.properties, secrets),
    ...(event.$set && { $set: redactProperties(event.$set, secrets) }),
    ...(event.$set_once && { $set_once: redactProperties(event.$set_once, secrets) }),
  };
}

export function redactLog(record: CaptureLogOptions, currentUrl: string): CaptureLogOptions {
  const secrets = secretsIn(currentUrl);
  return {
    ...record,
    body: redactText(record.body, secrets),
    attributes: {
      ...redactValue(record.attributes ?? {}, secrets),
      "url.full": redactUrl(currentUrl),
    },
  };
}

function start(
  load: LoadPostHog,
  token: string,
  release: string | undefined,
  storage: KeyValueStorage,
): Promise<void> {
  waitingCalls = [];
  return load()
    .then((posthog) => posthog.init(token, telemetryOptions(release, storage)))
    .then((started) => started && becomeActive(started))
    .catch(() => undefined)
    .finally(() => {
      waitingCalls = null;
    });
}

function becomeActive(started: ActiveClient): void {
  started.register({ product: PRODUCT });
  client = started;
  waitingCalls?.forEach((call) => call(started));
}

function withClient(call: ClientCall): void {
  if (client) call(client);
  else waitingCalls?.push(call);
}

function telemetryOptions(
  release: string | undefined,
  storage: KeyValueStorage,
): Partial<PostHogConfig> {
  return {
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
    advanced_disable_flags: true,
    logs: {
      serviceName: "next-session-web",
      environment: "production",
      serviceVersion: release,
      resourceAttributes: { product: PRODUCT },
      beforeSend: (record) =>
        measurementIsOn(storage) ? redactLog(record, window.location.href) : null,
    },
    before_send: (event) =>
      measurementIsOn(storage) ? redactEvent(event, window.location.href) : null,
  };
}

function isMeasured(eventName: string): boolean {
  return SENT_SDK_EVENTS.has(eventName) || eventName.startsWith(EVENT_PREFIX);
}

function redactProperties(properties: Properties, secrets: Secret[]): Properties {
  const kept = Object.entries(properties).filter(([key]) => !isDropped(key));
  return Object.fromEntries(kept.map(([key, value]) => [key, redactValue(value, secrets)]));
}

function isDropped(key: string): boolean {
  return DROPPED_PROPERTIES.has(key.replace(/^\$initial_/, "$"));
}

function redactValue<T>(value: T, secrets: Secret[]): T {
  if (typeof value === "string") return redactText(value, secrets) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => redactValue(item, secrets)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item, secrets)]),
    ) as T;
  }
  return value;
}

function redactText(text: string, secrets: Secret[]): string {
  const withoutSecrets = secrets.reduce(
    (scrubbed, secret) => scrubbed.replaceAll(secret.value, secret.placeholder),
    redactUrl(text),
  );
  return withoutSecrets.replace(SHARE_TOKEN_PATH_IN_TEXT, `/s/${SHARE_TOKEN}`);
}

function secretsIn(currentUrl: string): Secret[] {
  const parsed = parseUrl(currentUrl);
  if (!parsed) return [];
  const shareToken = SHARE_TOKEN_PATH.exec(parsed.url.pathname)?.[0].slice("/s/".length);
  const queryValues = [...parsed.url.searchParams]
    .filter(([key]) => !KEPT_QUERY_KEYS.includes(key))
    .map(([, value]) => value);
  return [
    ...(shareToken ? [{ value: shareToken, placeholder: SHARE_TOKEN }] : []),
    ...[...queryValues, parsed.url.hash.slice(1)].map((value) => ({
      value,
      placeholder: REDACTED,
    })),
  ].filter((secret) => secret.value.length >= SHORTEST_SCRUBBED_SECRET);
}

function keptQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams(
    KEPT_QUERY_KEYS.flatMap((key) => params.getAll(key).map((value) => [key, value])),
  );
  return kept.size > 0 ? `?${kept.toString()}` : "";
}

function parseUrl(text: string): { url: URL; absolute: boolean } | null {
  if (/\s/.test(text)) return null;
  const absolute = /^https?:\/\//i.test(text);
  const path = text.startsWith("/") && !text.startsWith("//");
  if (!absolute && !path) return null;
  return attempt(() => ({ url: new URL(text, "https://path.invalid"), absolute }), null);
}

function alreadyReported(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (reportedErrors.has(error)) return true;
  reportedErrors.add(error);
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserStorage(): KeyValueStorage {
  return attempt<KeyValueStorage>(() => window.localStorage, {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
}

function attempt<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}
