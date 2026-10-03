import { describe, expect, it } from "vitest";
import worker from "./index";

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

async function visit(path: string) {
  const assets = assetsServing("<!doctype html>");
  const response = await worker.fetch(new Request(`${app}${path}`), assets.env);
  return { response, requested: assets.requested };
}

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
