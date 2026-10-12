# Worker

The Cloudflare Worker in front of the web app: it serves the built assets, redirects legacy Lonir Share Links, and proxies PostHog ingestion under /ingest.

## entrances
- worker fetch: every HTTP request to next-session.link, from anyone on the web
  handler: index.ts
  trust: visitor
  control: none — it serves public assets, redirects legacy Lonir paths, and proxies only an allowlist of PostHog paths with a fixed header allowlist and set-cookie stripped; it holds no data or credential of its own

## invariants
