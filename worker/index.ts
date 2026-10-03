interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const lonirOrigin = "https://little-spaniel-709.convex.site";
const legacyShareLink = /^\/s\/[A-Za-z0-9_-]{8}\/?$/;
const legacyGroupsPage = /^\/groups(\/|$)/;

export function legacyRedirect(url: URL): string | null {
  const isLegacy = legacyShareLink.test(url.pathname) || legacyGroupsPage.test(url.pathname);
  return isLegacy ? `${lonirOrigin}${url.pathname}${url.search}` : null;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const lonirUrl = legacyRedirect(new URL(request.url));
    return lonirUrl ? Promise.resolve(Response.redirect(lonirUrl, 302)) : env.ASSETS.fetch(request);
  },
};
