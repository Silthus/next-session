# PostHog setup

What Next Session has in PostHog, and how to rebuild it. The design is `docs/spec.md` §13 and [ADR-0011](../adr/0011-posthog-cookieless-analytics-and-workflows-mail.md). Analytics, errors, logs and source maps are on in production. Welcome Mail and Tips activation is tracked in [#79](https://github.com/Silthus/next-session/issues/79).

## Mail activation

As of 2026-10-07, both workflows are active and all three email steps use sender channel `88088`. The sender still reports `verified: false`, so the production mail environment is unset. Mocked renders and webhook acceptance are proved; real email delivery and the Tips confirmation path still need live proof.

In PostHog EU project `13216`, open **Workflows → Channels → hello@next-session.link** and press **Verify** or **Verify DNS records**. Confirm the channel shows verified before setting `POSTHOG_MAIL_WEBHOOK_SECRET`, `POSTHOG_WELCOME_WEBHOOK_URL` and `POSTHOG_TIPS_WEBHOOK_URL` in Convex production. Both workflows must also be active. A webhook can return 201 before its email step runs, so acceptance alone does not prove delivery.

## Where things live

| Thing | Where |
| --- | --- |
| Project | Lonir's shared project on EU Cloud (`eu.posthog.com`), project ID `13216`. Free plan: events kept 1 year, logs 14 days |
| Sender | Workflows → Channels: `Michael from Next Session <hello@next-session.link>`. Its SES records (three `*._domainkey` CNAMEs, `feedback` MX and SPF, `_amazonses` TXT, the root SPF, `_dmarc`) are in the `next-session.link` zone, next to Resend's `send`, `rsend` and `resend._domainkey`. Channel ID `88088`. Someone must press **Verify** on the channel once: PostHog sends nothing from an unverified sender, and its verify endpoint refuses personal API keys |
| Email templates | Workflows → Library. Definitions in [`templates/`](templates) |
| Workflows | "Next Session: Welcome Mail" and "Next Session: Tips". Definitions in [`workflows/`](workflows) |
| Browser token | Repo variable `VITE_POSTHOG_TOKEN`, read by the deploy job's build |
| Source maps | Repo variable `POSTHOG_PROJECT_ID` and repo secret `POSTHOG_PERSONAL_API_KEY`. The deploy job installs `posthog-cli` pinned by its release checksum |
| Server token and mail | Convex prod env: `POSTHOG_PROJECT_TOKEN` is set. `POSTHOG_MAIL_WEBHOOK_SECRET`, `POSTHOG_WELCOME_WEBHOOK_URL` and `POSTHOG_TIPS_WEBHOOK_URL` wait for sender verification |
| Local copies | `~/.config/next-session/posthog.env` (token, personal API key) and `posthog-mail.env` (webhook secret) on devbox-michaelr-1. Never commit them |

## Templates

Each file in [`templates/`](templates) is the body of a `POST /api/environments/<project>/messaging_templates/`. PostHog renders the HTML from the `design`, so the templates open as editable blocks. The copy is §13.6's, in the app's gold-on-paper palette. `text` is the full plain-text version.

The Welcome Mail shows the Tips confirmation only when the trigger event has `tips_confirm_url` (`{% if event.properties.tips_confirm_url %}`). Tips link to `{{ unsubscribe_url }}`.

A workflow's email step copies the template when the step is saved. Editing a library template later changes no workflow. Edit the step, or save the step again with the template's ID.

## Workflows

Each file in [`workflows/`](workflows) is the body of a `POST /api/environments/<project>/hog_flows/`, with placeholders to fill in first:

| Placeholder | Value |
| --- | --- |
| `<POSTHOG_MAIL_WEBHOOK_SECRET>` | The secret in Convex's `POSTHOG_MAIL_WEBHOOK_SECRET`. The trigger refuses any request whose `Authorization` header is not `Bearer <secret>` |
| `<TEMPLATE:welcome>`, `<TEMPLATE:tip-1>`, `<TEMPLATE:tip-2>` | The library template IDs |
| `<SENDER_INTEGRATION_ID>` | The sender's channel ID, a number (`GET /api/environments/<project>/integrations/`, kind `email`) |
| `<REPLY_TO>` | The contact address, the repo variable `LEGAL_CONTACT_EMAIL`. `hello@next-session.link` has no inbox |

- **Welcome Mail:** webhook trigger, event `next_session:welcome_requested`, then one transactional email. Convex posts `{distinct_id, product, email, tips_confirm_url?}`.
- **Tips:** webhook trigger, event `next_session:tips_requested`, then wait up to 2 days for a `next_session:session_scheduled` with `product = next-session`, Tip 1, and wait up to 5 days for one more. A scheduled Session ends the run at either wait, so no Tip goes out after it; each timeout sends the next Tip. A wait only sees events that arrive while the run waits there, so a Session scheduled before the GM confirmed still gets both Tips.
- Every email step has `tracking_enabled: false`: no open pixel, no rewritten links.
- No message categories: PostHog refuses personal API keys on them. Welcome is `transactional`, so it ignores opt-outs. Tips are `marketing`, so an unsubscribe opts the address out of all marketing mail in the shared project. Lonir sends none through Workflows today. If it starts, add a "Next Session tips" category and set it on both Tip steps.
- The webhook only captures its event as the run's trigger data. The email address never becomes a stored PostHog event or person property.
- The webhook URL is `https://webhooks.eu.posthog.com/public/webhooks/<workflow id>`. It answers only while the workflow is active. Set the Convex mail env only after both workflows are active and the sender is verified. A 404 is not retried; a 201 from an unverified sender still does not deliver mail. Either can lose a Welcome Mail.

Test a workflow with `POST .../hog_flows/<id>/invocations/` (`configuration`, `globals`, `mock_async_functions: true`, `current_action_id`), one step at a time. The key needs `group:read` for that.

## Personal API key scopes

`hog_flow:write` (workflows and templates), `error_tracking:write` (source maps), `integration:read` (the sender ID) and `group:read` (workflow test runs).

Personal API keys can't verify the sender or manage message categories. Both need the PostHog UI.

## Test traffic

Convex marks events from a `.test` Account with `is_test_account: true`. The anonymous steps of a production check (link created, Player joined, Session scheduled before any Save) carry no mark. Exclude the check's `group_id`s in insights, and count first Sessions by unique `group_id`, because Schedule, Undo, Schedule sends `is_first_for_group` twice.

## Moving to a dedicated project

`docs/spec.md` §13.9: create the project in EU Cloud, re-create the sender, templates and workflows from these files, and change `VITE_POSTHOG_TOKEN`, `POSTHOG_PROJECT_ID`, the Convex env and the webhook URLs.

## Session updates (disabled, #97)

`workflows/session-updates.json` and `templates/session-update.json` define the third mail workflow. Do not enable it or set `POSTHOG_SESSION_WEBHOOK_URL` in #97. #102 verifies sender channel 88088, creates the "Session updates" category in the UI, replaces `<CATEGORY:session-updates>`, `<TEMPLATE:session-update>`, sender, reply-to and secret placeholders, tests both set and cancelled copy, and then supplies the environment with inbox proof. Keep its status `draft` until then. A category with type `marketing` enforces hosted unsubscribe; these are service updates with tracking off. Re-enabling the in-app switch does not reverse a hosted unsubscribe.

The webhook carries names, email and the current Share Link only as the run's trigger data. It captures no analytics event or person property. The editable design escapes Group names in HTML. Local graph reference: PostHog source `products/workflows/frontend/Workflows/workflowMetricsSummaryLogic.ts` at `9db777913f5907388cfc655c0d7fe531e8ddca54` confirms `message_category_id`, `message_category_type` and `tracking_enabled` on email configuration. Existing Welcome/Tips definitions supply the webhook and template shape. Live workflow rendering and hosted category proof remain with #102.

Convex estimates planned deliveries per UTC day across Welcome (1), Tips (2) and session recipients (1 each). It warns at 80 and above 100, but queues every eligible recipient. Delayed Tips, hosted suppression, timeout duplicates and other products mean this is not the provider's actual send count. Inspect the shared project's real quota before activation; a per-Group check cannot warn meaningfully with a 100-Player Roster cap and the actor excluded.
