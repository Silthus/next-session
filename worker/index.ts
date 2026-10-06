interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const lonirOrigin = "https://little-spaniel-709.convex.site";
const legacyShareLink = /^\/s\/[A-Za-z0-9_-]{8}\/?$/;
const legacyGroupsPage = /^\/groups/;

const ingestPrefix = /^\/ingest(?=\/|$)/;
const posthogApi = "https://eu.i.posthog.com";
const posthogAssets = "https://eu-assets.i.posthog.com";
const posthogAssetPaths = /^\/(static|array)\//;
const strippedRequestHeaders = ["cookie", "authorization", "x-forwarded-for"];

function legacyRedirect(url: URL): string | null {
  const isLegacy = legacyShareLink.test(url.pathname) || legacyGroupsPage.test(url.pathname);
  return isLegacy ? `${lonirOrigin}${url.pathname}${url.search}` : null;
}

function isIngest(url: URL): boolean {
  return ingestPrefix.test(url.pathname);
}

export function ingestTarget(url: URL): string | null {
  if (!isIngest(url)) return null;
  const posthogPath = url.pathname.replace(ingestPrefix, "");
  if (posthogPath === "" || posthogPath === "/") return null;
  const host = posthogAssetPaths.test(posthogPath) ? posthogAssets : posthogApi;
  return `${host}${posthogPath}${url.search}`;
}

async function proxyToPostHog(request: Request, target: string): Promise<Response> {
  const upstream = await fetch(
    new Request(target, {
      method: request.method,
      headers: forwardedHeaders(request.headers),
      body: hasBody(request) ? await request.arrayBuffer() : undefined,
    }),
  );
  const response = new Response(upstream.body, upstream);
  response.headers.delete("set-cookie");
  return response;
}

function forwardedHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  strippedRequestHeaders.forEach((name) => headers.delete(name));
  const visitorIp = incoming.get("cf-connecting-ip");
  if (visitorIp) headers.set("x-forwarded-for", visitorIp);
  return headers;
}

function hasBody(request: Request): boolean {
  return request.method !== "GET" && request.method !== "HEAD";
}

function handleIngest(request: Request, url: URL): Promise<Response> {
  const target = ingestTarget(url);
  return target
    ? proxyToPostHog(request, target)
    : Promise.resolve(new Response(null, { status: 204 }));
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (isIngest(url)) return handleIngest(request, url);
    const lonirUrl = legacyRedirect(url);
    return lonirUrl ? Promise.resolve(Response.redirect(lonirUrl, 302)) : env.ASSETS.fetch(request);
  },
};
