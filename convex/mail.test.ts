import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { requestMail, type MailRequest } from "./mail";
import { newBackend, type TestBackend } from "./model/test.setup";

const SECRET = "mail-webhook-secret";
const WELCOME_URL = "https://webhooks.example.test/welcome";
const TIPS_URL = "https://webhooks.example.test/tips";

let t: TestBackend;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function answer(...statuses: number[]) {
  for (const status of statuses) {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("POSTHOG_WELCOME_WEBHOOK_URL", WELCOME_URL);
  vi.stubEnv("POSTHOG_TIPS_WEBHOOK_URL", TIPS_URL);
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function newAccount(email = "gm@example.com") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    return (await ctx.db.get("users", userId))!;
  });
}

async function request(mail: Omit<MailRequest, "user">, user: Doc<"users">) {
  await t.run(async (ctx) => await requestMail(ctx, { ...mail, user }));
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}

function sentRequests() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url,
    method: init?.method,
    headers: new Headers(init?.headers),
    body: JSON.parse(init?.body as string) as Record<string, unknown>,
  }));
}

describe("requestMail", () => {
  it("posts the Welcome Mail request to the welcome webhook with the secret", async () => {
    const account = await newAccount();

    await request({ kind: "welcome" }, account);

    const [sent, ...more] = sentRequests();
    expect(more).toEqual([]);
    expect(sent!.url).toBe(WELCOME_URL);
    expect(sent!.method).toBe("POST");
    expect(sent!.headers.get("Authorization")).toBe(`Bearer ${SECRET}`);
    expect(sent!.headers.get("Content-Type")).toBe("application/json");
    expect(sent!.body).toEqual({
      distinct_id: `next-session:${account._id}`,
      product: "next-session",
      email: "gm@example.com",
    });
  });

  it("carries the Tips confirmation link in the Welcome Mail request", async () => {
    const account = await newAccount();
    const tipsConfirmUrl = "https://next-session.link/tips?confirm=abc";

    await request({ kind: "welcome", tipsConfirmUrl }, account);

    expect(sentRequests()[0]!.body).toMatchObject({ tips_confirm_url: tipsConfirmUrl });
  });

  it("posts the Tips request to the tips webhook", async () => {
    await request({ kind: "tips" }, await newAccount());

    expect(sentRequests().map(({ url }) => url)).toEqual([TIPS_URL]);
  });

  it("requests nothing without the webhook secret", async () => {
    vi.stubEnv("POSTHOG_MAIL_WEBHOOK_SECRET", "");

    await request({ kind: "welcome" }, await newAccount());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests nothing without the kind's webhook URL", async () => {
    vi.stubEnv("POSTHOG_TIPS_WEBHOOK_URL", "");

    await request({ kind: "tips" }, await newAccount());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["gm@example.test", "GM@Next-Session.TEST"])(
    "requests nothing for the test address %s",
    async (email) => {
      await request({ kind: "welcome" }, await newAccount(email));

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("retries a 503 and sends once when the retry succeeds", async () => {
    answer(503, 200);

    await request({ kind: "welcome" }, await newAccount());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await request({ kind: "welcome" }, await newAccount());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 429", async () => {
    answer(429, 200);

    await request({ kind: "welcome" }, await newAccount());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400", async () => {
    answer(400);

    await request({ kind: "welcome" }, await newAccount());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after 4 attempts", async () => {
    answer(500, 502, 503, 504, 200);

    await request({ kind: "welcome" }, await newAccount());

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("the Welcome Mail as a PostHog code send", () => {
  const SEND_URL = "https://eu.posthog.com/api/projects/@current/messaging/send/email/";

  beforeEach(() => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_project");
    vi.stubEnv("POSTHOG_SECRET_KEY", "phs_secret");
    vi.stubEnv("MAIL_REPLY_TO", "contact@example.com");
    vi.stubEnv("SITE_URL", "https://next-session.link");
    fetchMock.mockImplementation(() => Promise.resolve(accepted()));
  });

  function accepted() {
    return Response.json({ message_id: "message-1", replayed: false }, { status: 202 });
  }

  function refused(status: number, code: string) {
    return Response.json({ type: "validation_error", code, detail: code }, { status });
  }

  function codeSends() {
    return sentRequests().filter(({ url }) => url === SEND_URL);
  }

  it("sends the Welcome Mail from code with the project secret key, and calls no webhook", async () => {
    const account = await newAccount();

    await request({ kind: "welcome" }, account);

    const [sent, ...more] = codeSends();
    expect(more).toEqual([]);
    expect(sentRequests().map(({ url }) => url)).not.toContain(WELCOME_URL);
    expect(sent!.method).toBe("POST");
    expect(sent!.headers.get("Authorization")).toBe("Bearer phs_secret");
    expect(sent!.headers.get("Idempotency-Key")).toBe(`next-session:welcome:${account._id}`);
    expect(sent!.body).toMatchObject({
      to: "gm@example.com",
      distinct_id: `next-session:${account._id}`,
      template_key: "next-session-welcome",
      from: "Michael from Next Session <hello@next-session.link>",
      reply_to: ["contact@example.com"],
      subject: "Welcome to Next Session",
      capture_engagement: false,
    });
    expect(sent!.body.text).toContain("Open My groups: https://next-session.link/me");
    expect(sent!.body.text).not.toContain("tips");
    expect(sent!.body.html).toContain('href="https://next-session.link/me"');
  });

  it("carries the Tips confirmation link", async () => {
    const account = await newAccount();
    const tipsConfirmUrl = "https://next-session.link/tips?confirm=abc";

    await request({ kind: "welcome", tipsConfirmUrl }, account);

    expect(codeSends()[0]!.body.text).toContain(`Yes, send me the tips: ${tipsConfirmUrl}`);
  });

  it("keeps the Tips request on its webhook", async () => {
    const account = await newAccount();

    await request({ kind: "tips" }, account);

    expect(codeSends()).toEqual([]);
    expect(sentRequests().map(({ url }) => url)).toEqual([TIPS_URL]);
  });

  it("sends nothing to a test address", async () => {
    await request({ kind: "welcome" }, await newAccount("gm@example.test"));

    expect(codeSends()).toEqual([]);
  });

  it("uses the webhook while the deployment has no reply-to address", async () => {
    vi.stubEnv("MAIL_REPLY_TO", "");
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));

    await request({ kind: "welcome" }, await newAccount());

    expect(codeSends()).toEqual([]);
    expect(sentRequests().map(({ url }) => url)).toEqual([WELCOME_URL]);
  });

  it("retries a 503 with the same idempotency key until PostHog takes it", async () => {
    const account = await newAccount();
    fetchMock
      .mockResolvedValueOnce(refused(503, "service_unavailable"))
      .mockResolvedValueOnce(refused(503, "service_unavailable"))
      .mockResolvedValueOnce(refused(503, "service_unavailable"))
      .mockResolvedValueOnce(refused(503, "service_unavailable"));

    await request({ kind: "welcome" }, account);

    const sends = codeSends();
    expect(sends.length).toBe(5);
    expect(new Set(sends.map(({ headers }) => headers.get("Idempotency-Key")))).toEqual(
      new Set([`next-session:welcome:${account._id}`]),
    );
  });

  it("drops a send PostHog refuses, without retrying it", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(refused(400, "invalid_input")));

    await request({ kind: "welcome" }, await newAccount());

    expect(codeSends().length).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "PostHog refused the Welcome Mail: invalid_input, dropped",
    );
  });

  it("drops a send over the project's quota, without retrying it", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(refused(429, "quota_limited")));

    await request({ kind: "welcome" }, await newAccount());

    expect(codeSends().length).toBe(1);
  });
});
