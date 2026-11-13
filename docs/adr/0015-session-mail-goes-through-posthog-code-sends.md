# Session mail goes through PostHog code sends and keeps the calendar invite

Session mail (a Session set, changed or cancelled) leaves Convex as a PostHog transactional email sent from code, like the Welcome Mail and Reminders (ADR-0014). It keeps everything ADR-0012 decided about the mail itself: one mail per change, the Session update as the body, the iMIP invite `invite.ics` (`METHOD:REQUEST` or `CANCEL`) as its calendar part, the sender `Next Session <calendar@next-session.link>`, and the recipients. Only the provider changes: Resend goes, and Next Session sends all its mail through one provider and one key.

PostHog's code send now takes files: the SDK uploads each one by its hash, and the send names them. That removes the reason ADR-0012 split Session mail off to Resend (#122). The move is one clean run of the `migrate-email-resend` skill (PostHog/context-mill#510), so the app also shows what that skill produces.

The send is `codeMail.sendCalendar`, an action in the `"use node"` file the other code sends live in. `mail.sendCalendar` keeps its checks and hands the send to it. Each send is `sensitive: true`, so PostHog keeps no copy of its text, and has `tracking: { opens: false, engagement: false }`: Session updates count no opens or clicks, as the Privacy Policy says, and leave no address on the person. The action retrier still makes every retry with the same idempotency key, now a hash of the PostHog send's fields.

## What the live proof showed (2026-11-13, EU project 13216, from a local backend)

- A send with the content type the app builds, `text/calendar; charset=utf-8; method=REQUEST`, is refused with HTTP 400 `not_mime_type`: PostHog's code send takes only a bare MIME type for a file.
- A send with a bare `text/calendar` arrives: PostHog's log shows it delivered, and `invite.ics` arrives intact with `METHOD:REQUEST` inside. Gmail shows it as a file that opens and adds the Session, but shows no invitation card: a mail app reads the `method` parameter on the content type to show one (RFC 6047).
- Replaying a send with the same idempotency key returns the same message and sends no second email.

So the app keeps sending `method=…` on the content type and waits for PostHog to take content type parameters. A PostHog fix for that is in progress. Stripping the parameter to send today would turn every invite into a plain file: Gmail needs a tap more than it did with Resend, and Outlook, which #129 saw add, move and remove the entry with no tap, is unproven.

This supersedes [ADR-0012](0012-session-mail-goes-through-resend-and-carries-the-calendar-invite.md) on the provider, and amends ADR-0014's "Session mail stays on Resend".

## Considered Options

- **Stay on Resend.** It passes `text/calendar; method=…` through today, but keeps a second provider, a second key, a second suppression list and a second sending allowance for one kind of mail.
- **Send the bare `text/calendar` now.** Moves today, but Gmail shows no invitation card and Outlook's no-tap add is lost.
- **Postmark**, ADR-0012's fallback. A third provider for the same gap that PostHog's fix closes.

## Consequences

- Merging waits for PostHog to accept `method=…` in production, and for one more live send that shows it arrives with the invitation card. Until then every Session mail would be refused.
- `POSTHOG_PROJECT_TOKEN` and `POSTHOG_SECRET_KEY` switch Session mail on, and `RESEND_API_KEY` no longer does. A deployment with the PostHog keys sends Session mail.
- Resend's suppressed addresses move to PostHog's suppression list right before the switch (`docs/posthog/README.md`).
- The daily count keeps its `resend` key in `mailVolume`, and its cap, share and 600 ms spacing stay as Resend's 100-a-day quota set them, until they are sized to PostHog's sending allowance.
- Privacy Policy 1.15 names PostHog as the sender of Session emails, with its 30-day delivery log and the 37 days it keeps the invite file, and drops Resend.
- posthog-node is vendored from posthog-js PR 5514 until a release takes attachments.
