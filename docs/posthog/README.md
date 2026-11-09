# PostHog setup

What Next Session has in PostHog, and how to rebuild it. The design is `docs/spec.md` §13 and [ADR-0011](../adr/0011-posthog-cookieless-analytics-and-workflows-mail.md). Analytics, errors, logs and source maps are on in production. Welcome Mail and Tips activation is tracked in [#79](https://github.com/Silthus/next-session/issues/79).

## Mail activation

Welcome Mail and Tips are active in EU project `13216` since 2026-10-07, and Reminders since 2026-10-16 (below), using verified sender `88088`. The Welcome Mail and Reminders move from their workflows to code sends with [ADR-0014](../adr/0014-welcome-mail-and-reminders-are-posthog-code-sends.md) (below); Tips keep their workflow. The production mail environment is configured privately. #79 proved Welcome receipt and Tips confirmation; Tips retains its two-day maximum wait and can exit early after a Session is scheduled. Session updates go through Resend with a calendar invite (`docs/spec.md` §15), and their old workflow is archived (#162).

In PostHog EU project `13216`, open **Workflows → Channels → hello@next-session.link** and press **Verify** or **Verify DNS records**. Confirm the channel shows verified before setting any mail variable in Convex production: code sends use the same sender. For Tips, `POSTHOG_MAIL_WEBHOOK_SECRET` and `POSTHOG_TIPS_WEBHOOK_URL` need the Tips workflow active. A webhook can return 201 before its email step runs, so acceptance alone does not prove delivery.

## Code sends (Welcome Mail and Reminders)

[ADR-0014](../adr/0014-welcome-mail-and-reminders-are-posthog-code-sends.md) sends the Welcome Mail and Reminders with `posthog.emails.send()` from `convex/codeMail.ts`. Their copy is React Email components in [`emails/`](../../emails): `bun run mail:preview` shows them at `http://localhost:3030` with sample data. Convex sends them only when `POSTHOG_PROJECT_TOKEN`, `POSTHOG_SECRET_KEY` and `MAIL_REPLY_TO` are all set. Without them, no Welcome Mail goes out, no Reminder is scheduled, and My groups hides the Reminders switch. There is no webhook fallback.

Switch on in this order:

1. PostHog can send a code send without its open pixel and rewritten links, and `posthog-node` exposes it; `convex/codeMail.ts` turns it off. Today every code send is tracked, which §13 call 15 rules out.
2. In EU project `13216`, create a project secret API key with **Transactional email: Write**. Set it as `POSTHOG_SECRET_KEY` in Convex prod, and the contact address (the `LEGAL_CONTACT_EMAIL` variable) as `MAIL_REPLY_TO`. `main` before ADR-0014 ignores both, so set them before the merge. Never echo either into a log or comment.
3. Merge and deploy. Run the Reminder backfill once, `bunx convex run --prod reminders:scheduleUpcoming '{}'`, so Sessions published while the webhook was gone get their pair.
4. Sign up with an owned address, with and without Tips, once with Google so the greeting has a given name. Check the copy, both links and the reply-to, and the send under **Workflows → Transactional emails**, named `next-session-welcome`.
5. Schedule a disposable Session that starts a few minutes more than 2 hours from now, so its 2-hour Reminder is still ahead once the Undo window closes. Check that Reminder (`next-session-reminder`), its greeting by Player name, and its footer link, as #149 did.
6. Archive the "Next Session: Welcome Mail" and "Next Session: Reminders" workflows, and remove `POSTHOG_WELCOME_WEBHOOK_URL` and `POSTHOG_REMINDER_WEBHOOK_URL` from Convex prod. `POSTHOG_MAIL_WEBHOOK_SECRET` stays for Tips. Then delete the two forwarders in `convex/mail.ts` (`send`'s `"welcome"` kind and `sendReminder`): the retrier jobs queued for the workflows before the merge have run by then.

To stop both mails, remove `POSTHOG_SECRET_KEY`. Going back to the workflows means reverting ADR-0014's code.

`docs/spec.md` §13.9: create the project in EU Cloud, re-create the sender, templates and workflows from these files, and change `VITE_POSTHOG_TOKEN`, `POSTHOG_PROJECT_ID`, the Convex env and the webhook URLs.

## Where things live

| Thing | Where |
| --- | --- |
| Project | Lonir's shared project on EU Cloud (`eu.posthog.com`), project ID `13216`. Free plan: events kept 1 year, logs 14 days |
| Sender | Workflows → Channels: `Michael from Next Session <hello@next-session.link>`. Its SES records (three `*._domainkey` CNAMEs, `feedback` MX and SPF, `_amazonses` TXT, the root SPF, `_dmarc`) are in the `next-session.link` zone, next to Resend's `send`, `rsend` and `resend._domainkey`. Channel ID `88088`. Someone must press **Verify** on the channel once: PostHog sends nothing from an unverified sender, and its verify endpoint refuses personal API keys |
| Email templates | Workflows → Library. Definitions in [`templates/`](templates) |
| Workflows | "Next Session: Tips". "Next Session: Welcome Mail" and "Next Session: Reminders" are archived once code sends are on. Rebuild definitions in [`workflows/`](workflows) remain draft with placeholders |
| Browser token | Repo variable `VITE_POSTHOG_TOKEN`, read by the deploy job's build |
| Source maps | Repo variable `POSTHOG_PROJECT_ID` and repo secret `POSTHOG_PERSONAL_API_KEY`. The deploy job installs `posthog-cli` pinned by its release checksum |
| Server token and mail | Convex prod env: `POSTHOG_PROJECT_TOKEN` is set. `POSTHOG_SECRET_KEY`, `MAIL_REPLY_TO`, `POSTHOG_MAIL_WEBHOOK_SECRET` and `POSTHOG_TIPS_WEBHOOK_URL` are configured privately |
| Local copies | `~/.config/next-session/posthog.env` (token, personal API key) and `posthog-mail.env` (webhook secret) on devbox-michaelr-1. Never commit them |

## Templates

Each file in [`templates/`](templates) is the body of a `POST /api/environments/<project>/messaging_templates/`. PostHog renders the HTML from the `design`, so the templates open as editable blocks. The copy is §13.6's, in the app's gold-on-paper palette. `text` is the full plain-text version.

Only the Tips are templates here. Tips link to `{{ unsubscribe_url }}`. The Welcome Mail and Reminders are components in [`emails/`](../../emails).

A workflow's email step copies the template when the step is saved. Editing a library template later changes no workflow. Edit the step, or save the step again with the template's ID.

## Workflows

Each file in [`workflows/`](workflows) is the body of a `POST /api/environments/<project>/hog_flows/`, with placeholders to fill in first:

| Placeholder | Value |
| --- | --- |
| `<POSTHOG_MAIL_WEBHOOK_SECRET>` | The secret in Convex's `POSTHOG_MAIL_WEBHOOK_SECRET`. The trigger refuses any request whose `Authorization` header is not `Bearer <secret>` |
| `<TEMPLATE:tip-1>`, `<TEMPLATE:tip-2>` | The library template IDs |
| `<SENDER_INTEGRATION_ID>` | The sender's channel ID, a number (`GET /api/environments/<project>/integrations/`, kind `email`) |
| `<REPLY_TO>` | The contact address, the repo variable `LEGAL_CONTACT_EMAIL`. `hello@next-session.link` has no inbox |

- **Tips:** webhook trigger, event `next_session:tips_requested`, then wait up to 2 days for a `next_session:session_scheduled` with `product = next-session`, Tip 1, and wait up to 5 days for one more. A scheduled Session ends the run at either wait, so no Tip goes out after it; each timeout sends the next Tip. A wait only sees events that arrive while the run waits there, so a Session scheduled before the GM confirmed still gets both Tips.
- Every email step has `tracking_enabled: false`: no open pixel, no rewritten links.
- Tips remain `marketing`; their existing unsubscribe applies to all marketing in this shared project. Do not change that consent or category as part of Reminder setup. Personal API keys currently cannot manage the real categories; use the project UI.
- Webhook payloads are workflow trigger data, not application usage events or person properties. Provider operational delivery events separately contain recipient email and subject metadata. Actual sends report `$email_tracking_enabled=false`; inspected application events and person updates contain no email, Group name or Share Token. The optional `capture_workflows_engagement_events` setting could not be read because the key lacks `project:read`; actual delivery events are evidence, not a source-default assumption. No shared-project setting was changed.
- The webhook URL is `https://webhooks.eu.posthog.com/public/webhooks/<workflow id>`. It answers only while the workflow is active. Set the Tips webhook env only after the workflow is active and the sender is verified. A 404 is not retried; a 201 from an unverified sender still does not deliver mail. Either can lose a Welcome Mail.

Test a workflow with `POST .../hog_flows/<id>/invocations/` (`configuration`, `globals`, `mock_async_functions: true`, `current_action_id`), one step at a time. The key needs `group:read` for that.

## Personal API key scopes

`hog_flow:write` (workflows and templates), `error_tracking:write` (source maps), `integration:read` (the sender ID) and `group:read` (workflow test runs).

Personal API keys can't verify the sender or manage message categories. Both need the PostHog UI.

## Test traffic

Convex marks events from a `.test` Account with `is_test_account: true`. The anonymous steps of a production check (link created, Player joined, Session scheduled before any Save) carry no mark. Exclude the check's `group_id`s in insights, and count first Sessions by unique `group_id`, because Schedule, Undo, Schedule sends `is_first_for_group` twice.

## Moving to a dedicated project

`docs/spec.md` §13.9: create the project in EU Cloud, re-create the sender, templates and workflows from these files, and change `VITE_POSTHOG_TOKEN`, `POSTHOG_PROJECT_ID`, the Convex env and the webhook URLs.

## Reminders

Reminders have been on in production since 2026-10-16 (#149), first through the "Next Session: Reminders" workflow and, with ADR-0014, as code sends. Without the code-send env above, Convex schedules no Reminder.

The switch-on proof is on #149. Four mocked runs covered both leads, with and without a location. The backfill ran once and left no Session with two pairs. In production, a disposable Group scheduled for the same evening got only its 2-hour Reminder, because its 1-day time had already passed. PostHog sent it with tracking off, the provider reported it delivered, and Michael confirmed it in his inbox with the right Group, time, place, button and footer link. A second disposable Session, cancelled before its 2-hour job, sent nothing. The footer link, opened signed out, changed nothing until **Turn off Reminders**; My groups then showed the switch off, and turning it back on held through a reload.

Convex sends one Reminder per Account, 24 hours (`day`) and 2 hours (`hours`) before the Session starts, with event `next_session:reminder_requested`. `emails/ReminderMail.tsx` writes it from what `reminders.recipient` reads when the job fires:

| Value | What it is |
| --- | --- |
| `playerName` | The name the Group knows the Account's Claimed Player by, for the greeting |
| `groupName` | The Group's name at send time |
| `dateLabel` | The start's date in the Group's time zone at publish, "Saturday, October 17, 2026" |
| `startLabel` | The start in the Group's time zone at publish, 24-hour "19:00" |
| `location` | The published location. Left out when the Session has none |
| `playerUrl` | The current Share Link, read at send time. Nothing else carries a Share Token |
| `remindersOffUrl` | `https://next-session.link/reminders/off?t=<token>`, the Account's own Reminder link |

The subject is "Tomorrow: …" or "In 2 hours: … at 19:00", and the body says the Group "plays tomorrow" or "plays in 2 hours", so a Session just after midnight never reads "today" the evening before. It has no hosted unsubscribe link: the footer links to the Account's Reminders-off page, which asks before it changes anything.

Each Reminder counts 1 in the daily mail estimate when its job fires, never per retry. A job that runs more than 5 minutes after its due time sends nothing. A due time already past at publish is never scheduled. Network errors, a send still in flight, rate limits and 5xx get four attempts in all, with backoff and the same idempotency key; every attempt rechecks the published revision, the Claim, the Reminders switch and the current Share Link. Other refusals, `quota_limited` included, are logged and dropped.

## Delivery limits

The observed enforced tier-0 allowance is 50 emails per hour and 100 per day. Current project usage is private. Provider worker source reschedules accepted mail on sending-cap denial and SES throttling. The Reminder backend treats an ingress webhook 429 as a 4xx refusal and logs without retry; it is not proof of provider queuing. Network/5xx retries can duplicate mail after an accepted timeout. No live quota-exhaustion test was performed, and mocks do not prove quota behavior. Investigate any 429 or absent callback before claiming delivery; do not silently change backend retry semantics.
