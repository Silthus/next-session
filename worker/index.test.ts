import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { calendarTarget, ingestTarget } from "./index";

const app = "https://next-session.link";
const lonir = "https://little-spaniel-709.convex.site";
const convexSite = "https://calendar-test-123.convex.site";

function assetsServing(body: string) {
  const requested: string[] = [];
  return {
    requested,
    env: {
      CONVEX_SITE_URL: convexSite,
      ASSETS: {
        fetch: (request: Request) => {
          requested.push(request.url);
          return Promise.resolve(new Response(body, { status: 200 }));
        },
      },
    },
  };
}

async function visit(path: string, init?: RequestInit) {
  const assets = assetsServing("<!doctype html>");
  const response = await worker.fetch(new Request(`${app}${path}`, init), assets.env);
  return { response, requested: assets.requested };
}

function upstreamAnswering(response: Response) {
  const forwarded: Request[] = [];
  vi.stubGlobal("fetch", (request: Request) => {
    forwarded.push(request);
    return Promise.resolve(response);
  });
  return forwarded;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("legacy Lonir links", () => {
  it.each([
    "/s/AbC9_-xZ",
    "/s/AAAAAAAA/",
    "/s/AbC9_-xZ?month=July",
    "/groups",
    "/groups/",
    "/groups/k57abc123?tab=roster",
    "/groupsearch?tab=roster",
  ])("redirects %s to the same path and query on Lonir", async (path) => {
    const { response, requested } = await visit(path);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${lonir}${path}`);
    expect(requested).toEqual([]);
  });
});

describe("the new app", () => {
  it.each([
    "/",
    "/s/AbC9_-xZ12",
    "/s/AbC9_-x",
    "/s/AbC9_-xZ/extra",
    "/s/AbC9.-xZ",
    "/g/k57abc123?month=2026-11",
    "/assets/index-abc123.js",
  ])("serves %s from static assets", async (path) => {
    const { response, requested } = await visit(path);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html>");
    expect(requested).toEqual([`${app}${path}`]);
  });
});

describe("ingestTarget", () => {
  it.each([
    ["/ingest/static/array.js", "https://eu-assets.i.posthog.com/static/array.js"],
    [
      "/ingest/static/exception-autocapture.js?v=1.438.1",
      "https://eu-assets.i.posthog.com/static/exception-autocapture.js?v=1.438.1",
    ],
    ["/ingest/array/phc_abc/config.js", "https://eu-assets.i.posthog.com/array/phc_abc/config.js"],
    ["/ingest/e/?ip=0&_=1&ver=1.438.1", "https://eu.i.posthog.com/e/?ip=0&_=1&ver=1.438.1"],
    ["/ingest/i/v1/logs?token=phc_abc", "https://eu.i.posthog.com/i/v1/logs?token=phc_abc"],
    ["/ingest/i/v0/e/?ver=1", "https://eu.i.posthog.com/i/v0/e/?ver=1"],
    ["/ingest/batch/", "https://eu.i.posthog.com/batch/"],
  ])("sends %s to %s", (path, target) => {
    expect(ingestTarget(new URL(`${app}${path}`))).toBe(target);
  });

  it.each([
    "/ingest",
    "/ingest/",
    "/",
    "/ingestion",
    "/s/AbC9_-xZ12",
    "/static/array.js",
    "/ingest/api/projects/1/insights/",
    "/ingest/flags/?v=2",
    "/ingest/decide/",
    "/ingest/s/",
    "/ingest/E/",
  ])("has no PostHog target for %s", (path) => {
    expect(ingestTarget(new URL(`${app}${path}`))).toBeNull();
  });
});

describe("the /ingest proxy", () => {
  it("forwards to PostHog with the visitor's IP and without cookies or credentials", async () => {
    const forwarded = upstreamAnswering(new Response('{"status":1}', { status: 200 }));

    const { response, requested } = await visit("/ingest/e/?ver=1", {
      method: "POST",
      body: '{"batch":[]}',
      headers: {
        "content-type": "application/json",
        cookie: "session=abc",
        authorization: "Bearer secret",
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
        referer: "https://next-session.link/s/AbC9_-xZ12?code=SECRETCODE1",
        "user-agent": "Mozilla/5.0 Firefox/140.0",
        "accept-language": "de-DE",
        "sec-ch-ua-platform": '"Android"',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":1}');
    expect(requested).toEqual([]);
    expect(forwarded).toHaveLength(1);
    const upstream = forwarded[0]!;
    expect(upstream.url).toBe("https://eu.i.posthog.com/e/?ver=1");
    expect(upstream.method).toBe("POST");
    expect(await upstream.text()).toBe('{"batch":[]}');
    expect(Object.fromEntries(upstream.headers)).toEqual({
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Firefox/140.0",
      "x-forwarded-for": "203.0.113.7",
    });
  });

  it("forwards no client-supplied X-Forwarded-For when Cloudflare names no visitor IP", async () => {
    const forwarded = upstreamAnswering(new Response("ok"));

    await visit("/ingest/static/array.js", { headers: { "x-forwarded-for": "198.51.100.1" } });

    expect(forwarded[0]!.url).toBe("https://eu-assets.i.posthog.com/static/array.js");
    expect(forwarded[0]!.headers.has("x-forwarded-for")).toBe(false);
  });

  it("drops the cookies PostHog sets", async () => {
    upstreamAnswering(
      new Response("{}", {
        headers: { "set-cookie": "ph=1; Path=/", "content-type": "text/plain" },
      }),
    );

    const { response } = await visit("/ingest/e/", { method: "POST", body: "{}" });

    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it.each(["/ingest", "/ingest/", "/ingest/api/projects/1/insights/"])(
    "answers %s with 204 and forwards nothing",
    async (path) => {
      const forwarded = upstreamAnswering(new Response("unexpected"));

      const { response, requested } = await visit(path);

      expect(response.status).toBe(204);
      expect(forwarded).toEqual([]);
      expect(requested).toEqual([]);
    },
  );
});

describe("calendarTarget", () => {
  it.each([
    ["/cal/s/AbC9_-xZ12.ics", `${convexSite}/cal/s/AbC9_-xZ12.ics`],
    ["/cal/a/Feed_token-22chars0000.ics", `${convexSite}/cal/a/Feed_token-22chars0000.ics`],
    ["/cal/s/AbC9_-xZ12.ics?utm_source=mail", `${convexSite}/cal/s/AbC9_-xZ12.ics`],
  ])("sends %s to %s", (path, target) => {
    expect(calendarTarget(new URL(`${app}${path}`), convexSite)).toBe(target);
  });

  it.each([
    "/cal/",
    "/cal/s/",
    "/cal/s/.ics",
    "/cal/s/AbC9_-xZ12",
    "/cal/s/AbC9.xZ12.ics",
    "/cal/s/AbC9%2FxZ12.ics",
    "/cal/s/AbC9_-xZ12.ics/extra",
    "/cal/x/AbC9_-xZ12.ics",
    "/cal/api/auth/signin",
    "/api/auth/signin",
  ])("has no Convex target for %s", (path) => {
    expect(calendarTarget(new URL(`${app}${path}`), convexSite)).toBeNull();
  });
});

describe("the /cal proxy", () => {
  it("fetches the calendar file from Convex without cookies or client headers", async () => {
    const forwarded = upstreamAnswering(new Response("BEGIN:VCALENDAR", { status: 200 }));

    const { response, requested } = await visit("/cal/s/AbC9_-xZ12.ics?x=1", {
      headers: {
        cookie: "session=abc",
        authorization: "Bearer secret",
        "cf-connecting-ip": "203.0.113.7",
        "user-agent": "Mozilla/5.0 Firefox/140.0",
        accept: "text/calendar",
        "accept-language": "de-DE",
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("BEGIN:VCALENDAR");
    expect(requested).toEqual([]);
    expect(forwarded).toHaveLength(1);
    const upstream = forwarded[0]!;
    expect(upstream.url).toBe(`${convexSite}/cal/s/AbC9_-xZ12.ics`);
    expect(upstream.method).toBe("GET");
    expect(Object.fromEntries(upstream.headers)).toEqual({});
  });

  it("keeps the calendar headers and status and drops every other response header", async () => {
    upstreamAnswering(
      new Response("BEGIN:VCALENDAR", {
        status: 200,
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "cache-control": "private, max-age=900",
          "content-disposition": 'attachment; filename="next-session.ics"',
          "set-cookie": "convex=1; Path=/",
          "access-control-allow-origin": "*",
        },
      }),
    );

    const { response } = await visit("/cal/s/AbC9_-xZ12.ics");

    expect(Object.fromEntries(response.headers)).toEqual({
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=900",
      "content-disposition": 'attachment; filename="next-session.ics"',
    });
  });

  it("passes on a 404 for an unknown token with no body", async () => {
    upstreamAnswering(new Response(null, { status: 404 }));

    const { response } = await visit("/cal/a/UnknownFeedToken000000.ics");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it.each(["/cal/", "/cal/s/AbC9_-xZ12", "/cal/api/auth/signin"])(
    "answers %s with 404 and forwards nothing",
    async (path) => {
      const forwarded = upstreamAnswering(new Response("unexpected"));

      const { response, requested } = await visit(path);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
      expect(forwarded).toEqual([]);
      expect(requested).toEqual([]);
    },
  );

  it.each(["POST", "PUT", "DELETE", "HEAD"])(
    "answers %s with 405 and forwards nothing",
    async (method) => {
      const forwarded = upstreamAnswering(new Response("unexpected"));

      const { response, requested } = await visit("/cal/s/AbC9_-xZ12.ics", { method });

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(forwarded).toEqual([]);
      expect(requested).toEqual([]);
    },
  );
});
