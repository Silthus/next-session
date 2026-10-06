import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { ingestTarget } from "./index";

const app = "https://next-session.link";
const lonir = "https://little-spaniel-709.convex.site";

function assetsServing(body: string) {
  const requested: string[] = [];
  return {
    requested,
    env: {
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

function posthogAnswering(response: Response) {
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
  ])("sends %s to %s", (path, target) => {
    expect(ingestTarget(new URL(`${app}${path}`))).toBe(target);
  });

  it.each(["/ingest", "/ingest/", "/", "/ingestion", "/s/AbC9_-xZ12", "/static/array.js"])(
    "has no PostHog target for %s",
    (path) => {
      expect(ingestTarget(new URL(`${app}${path}`))).toBeNull();
    },
  );
});

describe("the /ingest proxy", () => {
  it("forwards to PostHog with the visitor's IP and without cookies or credentials", async () => {
    const forwarded = posthogAnswering(new Response('{"status":1}', { status: 200 }));

    const { response, requested } = await visit("/ingest/e/?ver=1", {
      method: "POST",
      body: '{"batch":[]}',
      headers: {
        "content-type": "application/json",
        cookie: "session=abc",
        authorization: "Bearer secret",
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
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
    expect(upstream.headers.get("content-type")).toBe("application/json");
    expect(upstream.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(upstream.headers.has("cookie")).toBe(false);
    expect(upstream.headers.has("authorization")).toBe(false);
  });

  it("forwards no client-supplied X-Forwarded-For when Cloudflare names no visitor IP", async () => {
    const forwarded = posthogAnswering(new Response("ok"));

    await visit("/ingest/static/array.js", { headers: { "x-forwarded-for": "198.51.100.1" } });

    expect(forwarded[0]!.url).toBe("https://eu-assets.i.posthog.com/static/array.js");
    expect(forwarded[0]!.headers.has("x-forwarded-for")).toBe(false);
  });

  it("drops the cookies PostHog sets", async () => {
    posthogAnswering(
      new Response("{}", {
        headers: { "set-cookie": "ph=1; Path=/", "content-type": "text/plain" },
      }),
    );

    const { response } = await visit("/ingest/e/", { method: "POST", body: "{}" });

    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it.each(["/ingest", "/ingest/"])("answers %s with 204 and forwards nothing", async (path) => {
    const forwarded = posthogAnswering(new Response("unexpected"));

    const { response, requested } = await visit(path);

    expect(response.status).toBe(204);
    expect(forwarded).toEqual([]);
    expect(requested).toEqual([]);
  });
});
