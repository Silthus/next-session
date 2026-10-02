# Unsaved Groups expire after 30 days without activity

A Group owned by an Anonymous GM carries `expiresAt`, pushed to now + 30 days by any GM or Player write, at most once a day so answer taps do not churn the Group row. A daily cron deletes Groups past `expiresAt` through the `by_expiresAt` index, and deletes an Anonymous GM together with its last Group. Saving clears `expiresAt`.

One-click creation is a public write. Without Expiry, abandoned Groups would pile up against Convex Free's 0.5 GB of storage. The GM surface shows the date, and the Terms and Privacy Policy state it, so nothing disappears silently. OmniGM deleted after 7 days and never told anyone.

## Considered Options

- 7 days (OmniGM's code): too short for groups that meet monthly.
- Never expire: storage grows without bound from drive-by clicks.
- Expire per user rather than per Group: needs a scan over all anonymous users instead of one index range.
