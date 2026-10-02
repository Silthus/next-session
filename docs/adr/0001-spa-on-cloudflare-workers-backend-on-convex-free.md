# SPA on Cloudflare Workers Static Assets, backend on Convex Free

The Vite build is served by the Cloudflare Worker `next-session` with Workers Static Assets, and `next-session.link` is attached to it as a Workers Custom Domain. Convex holds the database, functions, auth, and crons on the Free plan. Convex Free cannot serve a custom domain (that needs Pro), a proxied CNAME to `*.convex.site` gets a 403 because Convex routes by Host, and serving assets through `@convex-dev/static-hosting` would spend Convex's hard Free caps (1 GB file bandwidth, 1M function calls) on JavaScript bundles. Cloudflare serves static requests free and unmetered, and the zone is already on Cloudflare.

## Considered Options

- `@convex-dev/static-hosting` on `*.convex.site` behind a proxy Worker: one pipeline, but every page load counts against Convex's caps and the Worker's 100k requests a day.
- Vercel Hobby: non-commercial only, and it would move DNS for no gain.

## Consequences

- Two deploy targets from `main`: `convex deploy`, then `wrangler deploy`.
- The frontend talks to `<prod>.convex.cloud` across origins. Convex Auth keeps tokens in `localStorage`, so nothing depends on cookies on `next-session.link`.
- Research: `docs/research/hosting-and-auth.md` on branch `research/hosting-and-auth` (#4).
