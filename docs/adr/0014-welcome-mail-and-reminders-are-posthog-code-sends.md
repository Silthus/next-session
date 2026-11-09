# Welcome Mail and Reminders are PostHog code sends

The Welcome Mail and Reminders leave Convex as PostHog transactional emails sent from code: `posthog.emails.send()` in `posthog-node`, with the subject, text and HTML rendered in `convex/model/accountMailCopy.ts`. A code send needs no workflow, no webhook and no template copied into a workflow step. One project secret API key (`POSTHOG_SECRET_KEY`, scope `transactional_email:write`) replaces the webhook secret and the two webhook URLs for these mails. Each send carries an idempotency key derived from what it is for (`next-session:welcome:<user>`, `next-session:reminder:<session>:<revision>:<lead>:<user>`), so a retry after a timeout no longer mails twice within PostHog's 24 hours.

Tips stay on their workflow: the drip waits days between steps and stops when a Session is scheduled, which only a workflow does. Session mail stays on Resend until PostHog delivers attachments with `text/calendar; method=…` (ADR-0012).

The switch is the deployment's env. With `POSTHOG_PROJECT_TOKEN`, `POSTHOG_SECRET_KEY` and `MAIL_REPLY_TO` set, the Welcome Mail and Reminders go out as code sends; without them, they post to their webhooks as before. The choice is made when the mail is queued, so a retry never changes path, and the two paths' different idempotency keys never meet.

`posthog-node` resolves to its Node entry under Convex's bundler, so the sends live in a `"use node"` file, `convex/codeMail.ts`. Once `posthog-node` exports a `convex` condition for its edge entry, they can move back to the default runtime.

## Considered Options

- **Keep the webhook workflows.** No change, but the copy lives in two places (the repo's rebuild files and the workflow steps), a retry can mail twice, and Next Session doesn't try the code send it should help prove.
- **Templates made transactional in PostHog, sent by `templateId`.** The copy stays editable in PostHog, but it goes back to living outside the repo, unlike Session mail, and needs the UI to change.
- **A plain `fetch` to the send endpoint.** Runs in the default runtime, but reimplements the SDK's retries, idempotency and error codes.

## Consequences

- The copy lives in code next to Session mail's. The workflow templates of the Welcome Mail and Reminders retire once the switch is proven live, and the two workflows are archived.
- `captureEngagement: false` keeps the sends off the person. PostHog's code sends still add its open pixel and rewrite links today, so the switch stays off until PostHog lets a code send go out untracked (§13 call 15).
- The sends count toward the same PostHog sending allowance as before.
