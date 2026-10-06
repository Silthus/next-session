import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { logRecord, postHogProjectToken, toOtlpLogs, type LogRecord } from "./model/telemetry";

const POSTHOG_HOST = "https://eu.i.posthog.com";

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
  await post("events", `${POSTHOG_HOST}/batch/`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: token,
      batch: events.map((event): unknown => JSON.parse(event)),
    }),
  });
}

async function sendLogs(token: string, logs: LogRecord[]) {
  if (logs.length === 0) return;
  await post("logs", `${POSTHOG_HOST}/i/v1/logs`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(toOtlpLogs(logs)),
  });
}

async function post(what: string, url: string, init: { headers: HeadersInit; body: string }) {
  try {
    const response = await fetch(url, { method: "POST", ...init });
    if (!response.ok) console.error(`PostHog refused ${what}: HTTP ${response.status}, dropped`);
  } catch (error) {
    console.error(`PostHog unreachable for ${what}, dropped:`, describe(error));
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
