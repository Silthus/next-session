import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  logRecord,
  postHogProjectToken,
  toOtlpLogs,
  type LogRecord,
  type PostHogEvent,
} from "./model/telemetry";

const POSTHOG_HOST = "https://eu.i.posthog.com";
const SEND_TIMEOUT_MS = 10_000;

export const send = internalAction({
  args: { events: v.array(v.string()), logs: v.array(logRecord) },
  returns: v.null(),
  handler: async (_ctx, { events, logs }) => {
    const token = postHogProjectToken();
    if (!token) return null;
    await Promise.all([sendEvents(token, events), sendLogs(token, logs)]);
    return null;
  },
});

async function sendEvents(token: string, events: string[]) {
  if (events.length === 0) return;
  const batch = events.map((event) => JSON.parse(event) as PostHogEvent);
  await post(`events ${batch.map(({ event }) => event).join(", ")}`, `${POSTHOG_HOST}/batch/`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: token, batch }),
  });
}

async function sendLogs(token: string, logs: LogRecord[]) {
  if (logs.length === 0) return;
  await post(`${logs.length} log records`, `${POSTHOG_HOST}/i/v1/logs`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(toOtlpLogs(logs)),
  });
}

async function post(what: string, url: string, init: { headers: HeadersInit; body: string }) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "POST", ...init, signal: timeout.signal });
    if (!response.ok) console.error(`PostHog refused ${what}: HTTP ${response.status}, dropped`);
  } catch (error) {
    console.error(`PostHog unreachable for ${what}, dropped:`, describe(error));
  } finally {
    clearTimeout(timer);
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
