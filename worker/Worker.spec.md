# Worker

The Cloudflare Worker in front of the web app: it serves the built assets, redirects legacy Lonir Share Links, proxies PostHog ingestion under /ingest, and proxies calendar files under /cal to the Convex site.

## entrances
- worker fetch: every HTTP request to next-session.link, from anyone on the web
  handler: index.ts
  trust: visitor
  control: none — it serves public assets, redirects legacy Lonir paths, proxies only an allowlist of PostHog paths with a fixed header allowlist and set-cookie stripped, and proxies only GET of /cal/a/<token>.ics and /cal/s/<token>.ics to the CONVEX_SITE_URL origin with no client headers, keeping only content-type, cache-control and content-disposition on the way back; it holds no data or credential of its own

## invariants
