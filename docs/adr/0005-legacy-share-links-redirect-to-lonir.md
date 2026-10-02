# Legacy share links keep working by redirecting to Lonir

Today every `next-session.link` URL 301s to Lonir's `little-spaniel-709.convex.site`, and GMs have sent those links to their groups. Lonir's data is not migrated (out of scope for map #1). After the cutover, the Worker runs first on `/s/*` and `/groups*` only. A `/s/<token>` with an 8-character token (Lonir's length) and any `/groups...` path answer 302 to the same path and query on Lonir's origin. Everything else is served by the new app. New Share Tokens are 10 characters, so the two never collide.

## Considered Options

- A friendly "this link moved" page: breaks every running Lonir group at once.
- Migrating Lonir's groups: needs production access to Lonir, out of scope.

## Consequences

- The redirect is about ten lines in `worker/index.ts` and cheap to delete once Lonir stops serving Next Session.
- Only Worker-first paths count against the Workers Free request quota. Static assets stay unmetered.
