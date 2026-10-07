# PostHog setup

What Next Session has in PostHog, and how to rebuild it. The design is `docs/spec.md` §13 and [ADR-0011](../adr/0011-posthog-cookieless-analytics-and-workflows-mail.md). Analytics, errors, logs and source maps are on in production. Welcome Mail and Tips activation is tracked in [#79](https://github.com/Silthus/next-session/issues/79).

## Mail activation

As of 2026-10-07, Welcome Mail, Tips and Session updates are active in EU project `13216`, using verified sender `88088`. Their production webhook environment is configured privately. #79 proved Welcome receipt and Tips confirmation; Tips retains its two-day maximum wait and can exit early after a Session is scheduled. #102 proved Session schedule/cancellation action execution, delivery callbacks and inbox receipt. Michael confirmed both updates were readable and linked to My groups. Actor exclusion, both 30-second Undo directions and the authenticated email preference were also exercised without another Session send. Only owned disposable proof Groups were deleted, and the proof Account preference was restored.

In PostHog EU project `13216`, open **Workflows → Channels → hello@next-session.link** and press **Verify** or **Verify DNS records**. Confirm the channel shows verified before setting `POSTHOG_MAIL_WEBHOOK_SECRET`, `POSTHOG_WELCOME_WEBHOOK_URL` and `POSTHOG_TIPS_WEBHOOK_URL` in Convex production. The corresponding workflow must also be active. A webhook can return 201 before its email step runs, so acceptance alone does not prove delivery.

## Where things live

| Thing | Where |
| --- | --- |
| Project | Lonir's shared project on EU Cloud (`eu.posthog.com`), project ID `13216`. Free plan: events kept 1 year, logs 14 days |
| Sender | Workflows → Channels: `Michael from Next Session <hello@next-session.link>`. Its SES records (three `*._domainkey` CNAMEs, `feedback` MX and SPF, `_amazonses` TXT, the root SPF, `_dmarc`) are in the `next-session.link` zone, next to Resend's `send`, `rsend` and `resend._domainkey`. Channel ID `88088`. Someone must press **Verify** on the channel once: PostHog sends nothing from an unverified sender, and its verify endpoint refuses personal API keys |
| Email templates | Workflows → Library. Definitions in [`templates/`](templates) |
| Workflows | "Next Session: Welcome Mail", "Next Session: Tips" and "Next Session: Session updates". Rebuild definitions in [`workflows/`](workflows) remain draft with placeholders |
| Browser token | Repo variable `VITE_POSTHOG_TOKEN`, read by the deploy job's build |
| Source maps | Repo variable `POSTHOG_PROJECT_ID` and repo secret `POSTHOG_PERSONAL_API_KEY`. The deploy job installs `posthog-cli` pinned by its release checksum |
| Server token and mail | Convex prod env: `POSTHOG_PROJECT_TOKEN` is set. `POSTHOG_MAIL_WEBHOOK_SECRET`, `POSTHOG_WELCOME_WEBHOOK_URL`, `POSTHOG_TIPS_WEBHOOK_URL` and `POSTHOG_SESSION_WEBHOOK_URL` are configured privately |
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
| `<TEMPLATE:welcome>`, `<TEMPLATE:tip-1>`, `<TEMPLATE:tip-2>`, `<TEMPLATE:session-update>` | The library template IDs |
| `<SENDER_INTEGRATION_ID>` | The sender's channel ID, a number (`GET /api/environments/<project>/integrations/`, kind `email`) |
| `<REPLY_TO>` | The contact address, the repo variable `LEGAL_CONTACT_EMAIL`. `hello@next-session.link` has no inbox |

- **Welcome Mail:** webhook trigger, event `next_session:welcome_requested`, then one transactional email. Convex posts `{distinct_id, product, email, tips_confirm_url?}`.
- **Tips:** webhook trigger, event `next_session:tips_requested`, then wait up to 2 days for a `next_session:session_scheduled` with `product = next-session`, Tip 1, and wait up to 5 days for one more. A scheduled Session ends the run at either wait, so no Tip goes out after it; each timeout sends the next Tip. A wait only sees events that arrive while the run waits there, so a Session scheduled before the GM confirmed still gets both Tips.
- Every email step has `tracking_enabled: false`: no open pixel, no rewritten links.
- Welcome and Session updates are `transactional`, so provider marketing opt-outs do not affect them. Session updates has its own real category and an authenticated in-app opt-out. Tips remain `marketing`; their existing unsubscribe applies to all marketing in this shared project. Do not change that consent or category as part of Session setup. Personal API keys currently cannot manage the real categories; use the project UI.
- Webhook payloads are workflow trigger data, not application usage events or person properties. Provider operational delivery events separately contain recipient email and subject metadata. Actual Session sends report `$email_tracking_enabled=false`; inspected application events and person updates contain no email, Group name or Share Token. The optional `capture_workflows_engagement_events` setting could not be read because the key lacks `project:read`; actual delivery events are evidence, not a source-default assumption. No shared-project setting was changed.
- The webhook URL is `https://webhooks.eu.posthog.com/public/webhooks/<workflow id>`. It answers only while the workflow is active. Set the Convex mail env only after both workflows are active and the sender is verified. A 404 is not retried; a 201 from an unverified sender still does not deliver mail. Either can lose a Welcome Mail.

Test a workflow with `POST .../hog_flows/<id>/invocations/` (`configuration`, `globals`, `mock_async_functions: true`, `current_action_id`), one step at a time. The key needs `group:read` for that.

## Personal API key scopes

`hog_flow:write` (workflows and templates), `error_tracking:write` (source maps), `integration:read` (the sender ID) and `group:read` (workflow test runs).

Personal API keys can't verify the sender or manage message categories. Both need the PostHog UI.

## Test traffic

Convex marks events from a `.test` Account with `is_test_account: true`. The anonymous steps of a production check (link created, Player joined, Session scheduled before any Save) carry no mark. Exclude the check's `group_id`s in insights, and count first Sessions by unique `group_id`, because Schedule, Undo, Schedule sends `is_first_for_group` twice.

## Moving to a dedicated project

`docs/spec.md` §13.9: create the project in EU Cloud, re-create the sender, templates and workflows from these files, and change `VITE_POSTHOG_TOKEN`, `POSTHOG_PROJECT_ID`, the Convex env and the webhook URLs.

## Session updates

The existing [Session updates workflow](https://eu.posthog.com/project/13216/workflows/01a1159d-7d1c-0000-fb2e-a1761b594fcb/workflow?node=email_session) uses template `01a1159d-7a69-0000-0d29-42a1b505fadd` and category `01a115ad-3d17-0000-c6cc-ec3e891a4e82`. Discover existing resources before creating anything. `workflows/session-updates.json` and `templates/session-update.json` are rebuild definitions; resolve sender, reply-to, secret, template and category placeholders while keeping a replacement workflow inactive.

Michael confirmed Session updates are transactional service mail. Verify the real category and email action both use `transactional`, the sender is verified and the email action reads `tracking_enabled=false`. Transactional categories are absent from hosted preferences and bypass marketing unsubscribe. Each update instead links to the authenticated My groups switch, which stops Session emails across Groups without changing Welcome/Tips consent. Do not add a hosted unsubscribe link to Session copy or a new token-unsubscribe backend.

Before activation, exercise set/cancel renders using `mock_async_functions=true`: each must reach exactly one mocked sender, preserve readable subject/plain text, escape Group names once in HTML, and contain the My groups preference link. PostHog automatically escapes Liquid in HTML, so only subject/plain text use `raw`. Read the saved action and library template, rather than inferring tracking from defaults. Enable the tested workflow, verify missing/wrong Bearer requests return 401, then set and privately read back only `POSTHOG_SESSION_WEBHOOK_URL`. The shared secret must match `POSTHOG_MAIL_WEBHOOK_SECRET`.

For a live check, reuse an authorized existing Account and only disposable owned Groups. Wait through the unchanged 30-second Undo windows. Correlate the exact workflow/action/recipient with sent and delivered callbacks; a workflow 201 or successful action is not inbox receipt. Query fresh results when cached events have not caught up. Direct mailbox evidence or the recipient's confirmation is required before promising notifications to visitors. Restore the Account preference and preserve Tips consent, delays and credentials.

The webhook carries names, email and the current Share Link only as the run's trigger data. It captures no application usage event or person property. Provider operational delivery events separately contain recipient email and subject metadata. The editable design escapes Group names in HTML. Local graph reference: PostHog source `products/workflows/frontend/Workflows/workflowMetricsSummaryLogic.ts` at `9db777913f5907388cfc655c0d7fe531e8ddca54` confirms `message_category_id`, `message_category_type` and `tracking_enabled` on email configuration. Existing Welcome/Tips definitions supply the webhook and template shape. Live rendering, delivery, inbox and in-app opt-out proof are recorded on #102.

Convex estimates planned deliveries per UTC day across Welcome (1), Tips (2) and session recipients (1 each). It warns at 80 and above 100, but queues every eligible recipient. Delayed Tips, hosted suppression, timeout duplicates and other products mean this is not the provider's actual send count. Inspect the shared project's real quota before activation; a per-Group check cannot warn meaningfully with a 100-Player Roster cap and the actor excluded.

## Delivery limits

The observed enforced tier-0 allowance is 50 emails per hour and 100 per day. Current project usage is private. Provider worker source reschedules accepted mail on sending-cap denial and SES throttling. The Session backend treats an ingress webhook 429 as a 4xx refusal and logs without retry; it is not proof of provider queuing. Network/5xx retries can duplicate mail after an accepted timeout. No live quota-exhaustion test was performed, and mocks do not prove quota behavior. Investigate any 429 or absent callback before claiming delivery; do not silently change backend retry semantics.
