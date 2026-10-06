import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { newBackend, type TestBackend } from "./model/test.setup";
import { toPostHogEvent, type LogRecord } from "./model/telemetry";

const TOKEN = "phc_test_project_token";
const NOW = Date.UTC(2026, 9, 6, 15, 0);

const event = JSON.stringify(
  toPostHogEvent(
    {
      name: "group_created",
      actor: { _id: "user1" as Id<"users">, _creationTime: NOW },
      group_id: "group1",
    },
    NOW,
  ),
);
const log: LogRecord = {
  level: "info",
  body: "Expiry sweep finished",
  attributes: { groups_expired: 2 },
  time: NOW,
};

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", TOKEN);
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  t = newBackend();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function requestTo(url: string) {
  const call = fetchMock.mock.calls.find(([input]) => input === url);
  expect(call, `a request to ${url}`).toBeDefined();
  const init = call![1]!;
  return {
    method: init.method,
    headers: new Headers(init.headers),
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

describe("telemetry.send", () => {
  it("posts events to PostHog's EU batch endpoint with the project token", async () => {
    await t.action(internal.telemetry.send, { events: [event], logs: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = requestTo("https://eu.i.posthog.com/batch/");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.body).toEqual({ api_key: TOKEN, batch: [JSON.parse(event)] });
  });

  it("posts logs as OTLP/JSON to PostHog Logs, authorized by the project token", async () => {
    await t.action(internal.telemetry.send, { events: [], logs: [log] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = requestTo("https://eu.i.posthog.com/i/v1/logs");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.body).toMatchObject({
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "next-session-convex" } },
              { key: "product", value: { stringValue: "next-session" } },
            ],
          },
          scopeLogs: [{ logRecords: [{ body: { stringValue: "Expiry sweep finished" } }] }],
        },
      ],
    });
  });

  it("sends nothing when the deployment has no project token", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");

    await t.action(internal.telemetry.send, { events: [event], logs: [log] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an error answer", () => Promise.resolve(new Response("nope", { status: 503 }))],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
  ])("logs %s to the Convex console without the token and drops it", async (_, answer) => {
    fetchMock.mockImplementation(answer);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await t.action(internal.telemetry.send, { events: [event], logs: [log] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(consoleError.mock.calls)).toContain("next_session:group_created");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(TOKEN);
  });

  it("gives up on a PostHog that never answers after 10 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockImplementation(
      (_, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const sending = t.action(internal.telemetry.send, { events: [event], logs: [] });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(consoleError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await sending;

    expect(consoleError).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
