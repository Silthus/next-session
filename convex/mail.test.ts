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
    const tipsConfirmUrl = "https://next-session.link/tips?code=abc";

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
