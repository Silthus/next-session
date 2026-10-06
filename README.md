# Proof for #79

- `logs/legal-red.log`, `logs/legal-green.log`: the policy tests before and after 1.4.
- `logs/cli-pin-*.log`: the pinned posthog-cli step, and a tampered checksum failing it.
- `logs/check-summary.log`: `bun run check` on the branch.
- `screens/`: the PostHog-rendered Welcome Mail (390 px, Tips link shown) and Tip 1 (640 px).
- `live/deploy-sourcemaps.log`: the deploy of `76001e6`, posthog-cli checksum OK, release created, 29 chunks uploaded.
- `live/server-proof.log`, `live/convex-logs.log`: an anonymous GM, a Player, Schedule and Unschedule on prod, then the Group removed. Four `telemetry:send` runs, none refused.
- `live/otlp-proof.log`: one log record from the real `toOtlpLogs`, accepted by `/i/v1/logs`.
- `live/browser-proof.log`: a headed Chromium visit, every capture decoded: `$pageview` with the Product Marker, the Share Token redacted, no device reads, nothing stored, no cookies.
- `screens/privacy-live--1280.png`: `/privacy` on prod with 1.4's text and the switch.
