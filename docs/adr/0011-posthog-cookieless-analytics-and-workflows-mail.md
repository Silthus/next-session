# PostHog runs cookieless in Lonir's project; lifecycle mail goes through Workflows with double opt-in Tips

Next Session sends product analytics, error reports and logs to PostHog EU Cloud, into the project Lonir already uses (Michael's call, 2026-10-06). That reverses the source inventory's call C3 (#2), which dropped analytics together with Lonir's consent banner. It brings analytics back without the banner.

- **Cookieless, no banner, as an assessed risk.** The browser runs `posthog-js` in `cookieless_mode: "always"` with `person_profiles: "never"`, no autocapture and no session replay. It stores nothing on the device and drops the device properties it reads through JavaScript, keeping only what every HTTP request carries. § 25 TDDDG covers reading as well as storing, and the EDPB reads Art. 5(3) ePrivacy broadly, so this lowers the consent risk without removing it. Browser measurement therefore switches on only after Michael, as the controller, accepts that position; the alternative is a banner. The pseudonymous measurement rests on legitimate interest, and an objection is enforced (a browser opt-out on `/privacy`, `users.analyticsObjectedAt` for an Account). The one-click landing (ADR-0002) is the reason to try without a banner.
- **Server-side facts.** Committed facts (link created, Account created, Player joined, Session scheduled) are captured by Convex: a mutation schedules one internal action that posts to PostHog. Accounts are identified as `next-session:<users._id>` and never joined with Lonir persons by email.
- **One product, marked.** Every event carries `product: "next-session"` and a `next_session:` name prefix; logs carry `service.name` `next-session-*`. Next Session reads no feature flag. Workflows filter on the marker, so Lonir users never get Next Session mail.
- **Mail, started only by Convex.** PostHog workflows send every new Account a transactional Welcome Mail and, after double opt-in, two Tips, with tracking off and an unsubscribe link. Each workflow has a webhook trigger guarded by a secret header, and Convex calls it through a retrying action. Captured events never start a mail: the project token is public, so an event-triggered workflow would mail any address anyone posts. Double opt-in is a ticked box in the Save sheet plus a button press on the page the Welcome Mail links to; opening the link alone confirms nothing, so mail scanners cannot subscribe anyone (§ 7 UWG).
- **OTEL where it runs.** Logs go over OTLP from the browser (`posthog.logger`) and from Convex actions (a plain `fetch` of OTLP/JSON). Traces are not built: Convex emits no spans and its WebSocket calls carry no trace headers. Convex's own PostHog log stream and exception reporting need Convex Pro; turning them on is the upgrade, with no code change.

Everything ships disabled and turns on only where the production deploy provides the keys.

## Considered Options

- **A consent banner with `cookieless_mode: "on_reject"`**, as Lonir does. Safer against the EDPB's broad reading of Art. 5(3) ePrivacy (Guidelines 2/2023), and it would allow session replay. It costs a decision in front of the one-click landing. It is one init option plus a banner if the lawyer reviewing the drafts asks for it.
- **A dedicated PostHog project.** Clean separation, no marker discipline. Michael chose the shared project; moving later is a few config values (`docs/spec.md` §13.9).
- **Identify Accounts by email.** One person across Lonir and Next Session. It combines data across products, which the Privacy Policy would have to justify.
- **An OTEL SDK in a Node action.** Spans for the action alone, a cold start on every send, and nothing from queries or mutations.
- **Resend from Convex for the drip.** Full control in code, but the campaign, its unsubscribe page and its delays would be ours to build. Resend stays the plan for Session notifications, which fan out to many recipients (§12.6).
- **Event-triggered workflows.** Simplest to build, and forgeable by anyone with the public project token.
- **Single opt-in Tips, or Tips as service messages.** Fewer steps, but consent to email advertising in Germany has to be provable, and double opt-in is how it is proven.

## Consequences

- C3's "nothing non-essential is stored" still holds: PostHog stores nothing on the device. The Privacy Policy changes anyway: PostHog becomes a processor, and the "no analytics" sentence goes.
- Browser events and server events do not join: the browser has no identity, by design. Funnels across both use `group_id`.
- Server errors from queries and mutations stay in the Convex dashboard until Convex Pro. The browser reports the unexpected ones it sees, with the Convex request ID.
- Shared-project settings (cookieless server hash, IP discard) apply to Lonir too, so Michael changes them, not an agent.
- Each server-tracked fact costs one Convex action call, which is why answer taps are not tracked on the server.

## Amendment, 2026-10-07: Session updates use Workflows

Michael chose PostHog Workflows for Session updates, superseding the Session-notification Resend plan above. Resend from Convex remains the considered alternative. Convex fans out through the existing secret-guarded webhook pattern, with the current Claimed Accounts, an Account preference and a hosted "Session updates" unsubscribe category. Group names, emails and Share Links are workflow trigger data only, never capture events or person properties.

Implementation #97 ships disabled. #102 owns sender verification, category creation, live mail environment, inbox proof and the visitor notification promise. Neither implementation nor this amendment enables production mail. The current design is in `docs/spec.md` §12.6 and §13.7.
