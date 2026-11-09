# Welcome Mail and Reminders are PostHog code sends

The Welcome Mail and Reminders leave Convex as PostHog transactional emails sent from code: `posthog.emails.send()` in `posthog-node`. A code send needs no workflow, no webhook and no template copied into a workflow step. One project secret API key (`POSTHOG_SECRET_KEY`, scope `transactional_email:write`) replaces the webhook secret and the two webhook URLs for these mails. Each send carries an idempotency key derived from what it is for (`next-session:welcome:<user>`, `next-session:reminder:<session>:<revision>:<lead>:<user>`), so a retry after a timeout no longer mails twice within PostHog's 24 hours.

Their copy is React Email components in `emails/` (`WelcomeMail.tsx`, `ReminderMail.tsx`, a shared `MailLayout.tsx`). One component renders both the HTML and the text part, so the two never drift, and `bun run mail:preview` shows each mail with sample data while it is written. The Welcome Mail greets a Google Account by the given name Google sends, which the Account keeps, and greets a Password Account with "Hi there", since its sign-up asks for no name. A Reminder greets the Claimed Player by the name the Group knows them by. Privacy Policy 1.14 names both.

There is no fallback to the workflows. With `POSTHOG_PROJECT_TOKEN`, `POSTHOG_SECRET_KEY` and `MAIL_REPLY_TO` set, the mails go out as code sends; without them, a deployment sends neither, schedules no Reminder and hides the Reminders switch, as it did before without the webhook env. Two paths would keep two copies of each mail and two retry rules alive for a switch-over that happens once.

Tips stay on their workflow: the drip waits days between steps and stops when a Session is scheduled, which only a workflow does. Session mail stays on Resend and its own HTML until PostHog delivers attachments with `text/calendar; method=…` (ADR-0012).

`posthog-node` resolves to its Node entry under Convex's bundler, so the sends live in a `"use node"` file, `convex/codeMail.ts`. Once `posthog-node` exports a `convex` condition for its edge entry, they can move back to the default runtime. Its own retries are off (`maxRetries: 0`): the action retrier makes every retry, so a Reminder's Account is checked again before each attempt.

## Considered Options

- **Keep the webhook workflows.** No change, but the copy lives in two places (the repo's rebuild files and the workflow steps), a retry can mail twice, and Next Session doesn't try the code send it should help prove.
- **Code sends with the workflows as a fallback.** Switching back is one env change, but both copies and both paths stay maintained, and the repo never shows what a finished migration looks like.
- **Templates made transactional in PostHog, sent by `templateId`.** The copy stays editable in PostHog, but it goes back to living outside the repo, unlike Session mail, and needs the UI to change.
- **HTML built from strings, as Session mail is.** No new dependency, but the markup is hard to read and review, the text part is written twice, and nobody sees the mail before it is sent.
- **A plain `fetch` to the send endpoint.** Runs in the default runtime, but reimplements the SDK's idempotency and error codes.

## Consequences

- The workflows "Next Session: Welcome Mail" and "Next Session: Reminders" are archived after the switch, and their rebuild files are gone from `docs/posthog/`.
- The mails count opens and clicks: PostHog adds its open pixel and rewrites their links, by Michael's call on 2026-11-09 (§13 call 15). `captureEngagement: false` keeps the counts off the person; they show per send under **Workflows → Transactional emails**. Privacy Policy 1.14 names it.
- A retrier job keeps the function and arguments it was queued with, so `mail.send` still takes a queued `"welcome"` request and `mail.sendReminder` still exists; both forward to their code send. They go with the workflows in switch-on step 5.
- Merging this before the key is set stops both mails. The key is set first, then the merge, then the Reminder backfill once (`docs/posthog/README.md`).
- `react-email` is a runtime dependency of the Convex Node bundle, and `@react-email/ui` a dev dependency for the preview.
- The sends count toward the same PostHog sending allowance as before.
