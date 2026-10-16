# Can our mail path send a calendar invite?

Research for ticket #122 of map #120. Read 2026-10-16. This branch is never merged.

## Answer

**No. PostHog Workflows cannot send a calendar invite.** Its email step builds a plain `text` and `html` message and has no field for an attachment, an extra MIME part or a custom `Content-Type`. That rules out `text/calendar; method=REQUEST`, an `.ics` attachment and a later `METHOD:CANCEL`.

**Smallest alternative: Resend, called from Convex, for the invite only.** Resend's send API takes attachments with a `content_type`, so the one mail that must be an invite goes out through it. Welcome Mail and Tips stay in Workflows. Four things need a live test before anyone builds on this (see "Needs a live test").

## 1. PostHog Workflows cannot do it

| Evidence | What it shows |
| --- | --- |
| [`CyclotronInvocationQueueParametersEmailSchema`](https://github.com/PostHog/posthog/blob/964d45e6c5765dfe4a43d5c7bc79c91df06a498c/nodejs/src/cdp/schema/cyclotron.ts#L150-L172) | The whole input of an email step: `to`, `from`, `replyTo`, `cc`, `bcc`, `subject`, `preheader`, `text`, `html`. No attachment, header or MIME field. |
| [`EmailService`, SES call](https://github.com/PostHog/posthog/blob/964d45e6c5765dfe4a43d5c7bc79c91df06a498c/nodejs/src/cdp/services/messaging/email.service.ts#L1086-L1137) | It sends through SES v2 `Content.Simple` with only `Subject` and `Body.Text` / `Body.Html`. The only headers set are PostHog's own: `List-Unsubscribe` (non-transactional), the tracking code and `Auto-Submitted`. |
| [SES v2 `SendEmail`](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html) | SES itself could carry attachments (`Simple.Attachments`, or a `Raw` MIME message). PostHog does not use either, so the limit is PostHog's. |
| [Configure a workflows channel](https://posthog.com/docs/workflows/configure-channels), [Workflow builder](https://posthog.com/docs/workflows/workflow-builder) | Both are silent on attachments, ICS and custom headers. They list a sender name and address, templates with HTML and text, and a tracking toggle. [Changelog](https://posthog.com/docs/workflows/changelog) renders no entries (a "Loading" placeholder), so it proves nothing. |

Source read at `PostHog/posthog` commit `964d45e` (2026-10-16). A newer PostHog release could add attachments; nothing in the docs or the source says it is planned.

Put an HTML link to a hosted `.ics` in the mail and it is only a link. Gmail, Outlook and Apple Mail build their invite cards (Accept / Add to calendar) from a `text/calendar` MIME part with a `method` parameter, not from a link.

**The webhook step is not a way round it.** The workflow builder has a [webhook / HTTP step](https://posthog.com/docs/workflows/workflow-builder) that calls external systems. A workflow could call Resend's API, but then Convex must still pass the whole invite body to the workflow, and the workflow only forwards it. That adds a hop and a place to fail, and gains nothing over Convex calling Resend itself.

## 2. What a calendar client needs

- **`text/calendar` with a `method` parameter equal to the iCalendar `METHOD`.** [RFC 6047 §2.4](https://datatracker.ietf.org/doc/html/rfc6047#section-2.4): the `method` parameter "MUST be the same (ignoring case)" as the `METHOD` property; a `text/calendar` part without one is not an iMIP part. `charset=UTF-8` is required for non-ASCII text.
- **`ORGANIZER` and `ATTENDEE` as `mailto:` URIs** ([RFC 6047 §2.3](https://datatracker.ietf.org/doc/html/rfc6047#section-2.3)). Clients read the organizer from the calendar body, not from the mail headers.
- **Update = `REQUEST` with the same `UID` and a higher `SEQUENCE`; cancel = `CANCEL` with the same `UID`, a higher `SEQUENCE`, `STATUS:CANCELLED`, plus `ORGANIZER` and `DTSTAMP`** ([RFC 5546 §3.2.2, §3.2.5, §2.1.4](https://datatracker.ietf.org/doc/html/rfc5546)). A time change needs a `SEQUENCE` bump. So the `UID` must be stable per Session, and Convex must keep a counter per Session.
- **`PUBLISH` is the no-RSVP variant.** [RFC 5546 §3.2.1](https://datatracker.ietf.org/doc/html/rfc5546): `ATTENDEE` "MUST NOT be present", there is no reply flow, and `CANCEL` can withdraw it. Because RSVP sync is out of scope for the map, `PUBLISH` fits better than `REQUEST`: it avoids a `METHOD:REPLY` going to an organizer address that has no inbox. Whether Gmail, Outlook and Apple Mail still offer a one-tap add for a `PUBLISH` mail is not in any source I found. It needs a live test.
- **Signing.** RFC 6047 §2.2.2 says authentication MUST use S/MIME. Mainstream providers do not sign. Postmark and Cronofy document unsigned invites as the normal recipe, but no source I read says what each client does with an unsigned one. Part of the live test.

### Whether the event lands without the player doing anything

This matters for the map's "no explicit onboarding" note. Google Calendar has a per-user setting, "Add invitations to my calendar", with three values: from everyone, only if the sender is known, and only when the user responds in the email ([Google Calendar Help](https://support.google.com/calendar/answer/13159188)). The page does **not** say which is the default. For "only if the sender is known", an unknown sender's invite is added only after the player clicks **Add to calendar** or RSVPs ([Google Calendar API guide](https://developers.google.com/calendar/api/concepts/inviting-attendees-to-events)). A new `hello@next-session.link` is an unknown sender to every player. Whether an invite from it appears in the calendar by itself, or waits behind one tap in the mail, needs a live test with Gmail accounts at several settings. I could not close it from docs.

Google also advises against a generic sender: "Don't use a generic email address (for example, `invitation@example.com`) to send invitations", and a per-organizer static address if the real organizer's cannot be used ([same guide](https://developers.google.com/calendar/api/concepts/inviting-attendees-to-events)). One address for all Next Session invites is exactly the generic case. Whether it hurts in practice is untested.

## 3. Resend from Convex

### Can it send the invite?

- The send API takes `attachments[]` with `content` (Base64 or buffer), `filename`, `path`, `content_id` and an optional `content_type` that is otherwise inferred from the filename. The total message limit is 40 MB after Base64 ([Send Email](https://resend.com/docs/api-reference/emails/send-email), [Attachments](https://resend.com/docs/dashboard/emails/attachments)). Attachments do not work on the batch endpoint.
- Neither page mentions calendar invites or `text/calendar`. The Attachments page does not document `content_type`; the API reference does.
- A [`resend-node` issue (#278)](https://github.com/resend/resend-node/issues/278) shows the history: a top-level `Content-Type` header failed with "Duplicate header 'Content-Type'". The closing comment says Resend then added "a custom header specifically to the `attachment`" and points to its `with-ical` example. I could not fetch that example (404 at the guessed path), so how the header is set is unverified.
- **Not shown by any doc:** whether Resend passes a full `text/calendar; charset=utf-8; method=REQUEST` value through unchanged, whether it also adds the text/html body as `multipart/alternative` beside it, and whether it base64-encodes the part. Postmark and Cronofy recommend sending the calendar both inline (7bit) and as a base64 attachment for wider compatibility ([Postmark](https://postmarkapp.com/support/article/1101-how-do-i-send-calendar-invites-with-postmark), [Cronofy](https://docs.cronofy.com/developers/smart-invites/sending/)); one attachment through Resend may be enough or may not. **Needs a live test**: send to a Gmail, an Outlook.com and an iCloud address, then read the raw source.

### Limits and price

| | Free | Pro |
| --- | --- | --- |
| Emails | 3,000 a month, **100 a day** | $20 a month for 50,000; $35 for 100,000; overage $0.90 per 1,000 |
| Domains | 3 | 10 |
| Retention | 30 days | not read |

Source: [Resend pricing](https://resend.com/pricing). The API is [limited to 10 requests a second per team on every plan](https://resend.com/docs/api-reference/rate-limit). Going over a quota returns `429` (`daily_quota_exceeded` or `monthly_quota_exceeded`); mail you receive also counts toward the quota. The 100 a day cap is the same size as PostHog's tier 0 cap, so Resend free does not add headroom for a busy night, but it does take the invites out of the PostHog quota that Lonir's mail shares (see spec §12.6).

Volume check: an invite is one mail per Claimed Account per Session change. That is the same count as the Session update mail it would replace (see "Open questions").

### Sender domain on `next-session.link`

- Resend recommends sending from a subdomain ([Domains](https://resend.com/docs/dashboard/domains/introduction)); the Add a Domain page that lists the exact SPF, DKIM and MX records was not read.
- The repo already says the zone holds Resend records, `send` and `resend._domainkey` (spec §13.6; `docs/posthog/README.md`). So the domain may be verified in a Resend account already. **Unknown which account owns it** (Lonir's or Michael's own) and what plan it is on. The decision ticket needs that answer before it counts Resend's free quota as Next Session's.
- PostHog's own SES records sit beside Resend's without conflict, per the README. The README also lists `_dmarc` in the zone; I did not read its policy.
- Sending region: `us-east-1`, `eu-west-1`, `sa-east-1` or `ap-northeast-1`. The region only chooses where mail is dispatched from. "account data is stored in the United States regardless" ([Regions](https://resend.com/docs/dashboard/domains/regions)).

### What the Privacy Policy would have to name

`docs/legal/privacy.md` §4 lists PostHog Inc. as the mail processor. Adding Resend means:

- **A new row in the processor table:** Plus Five Five, Inc. (Resend), purpose "sending calendar invitations for sessions", location USA. Resend's [DPA](https://resend.com/legal/dpa) makes it a processor for customer content, relies on the EU SCCs and says it complies with the EU–US Data Privacy Framework (§6, §11.1).
- **Its sub-processor:** Amazon Web Services, Inc. does hosting and outbound delivery, USA. Resend's [sub-processor list](https://resend.com/legal/subprocessors) (updated 2026-08-27) names no AWS region. The DPA gives 14 days' notice of sub-processor changes.
- **A new data row:** the invite carries the recipient's email, Group name, the Session date and time, the Group's location and the Share Link. The Group location is a new field (see the map's Group settings work); the table's "session emails" row lists only email, group name, session date, share link and email preference, so location and start time must be added.
- **Retention:** Resend's free plan keeps data 30 days ([pricing](https://resend.com/pricing)); the retention table in `privacy.md` has no row for mail-delivery records at PostHog either, so it gains a mail-provider row.
- **The calendar itself:** once the event is in a player's calendar, Google, Apple or Microsoft hold it under their own terms, like the Google sign-in paragraph in §3.
- The ADR-0011 amendments' line "Provider operational delivery records may contain recipient email and subject metadata" applies to Resend too.
- If the **Terms** mention mail, check them; the map notes already flag this as open.

Also the ADR-0011 rules still apply to the Resend path: only Convex starts it, no personal data into PostHog events, `.test` addresses skipped, one mail per Account, and the actor excluded.

## 4. Other providers (one line each)

- **Postmark:** documents invites explicitly, `ContentType: "text/calendar; charset=utf-8; method=REQUEST"` in `Attachments`, recommends inline plus attached ([support article](https://postmarkapp.com/support/article/1101-how-do-i-send-calendar-invites-with-postmark)). Says nothing about cancellations. Free plan is 100 emails a month with no overage; paid starts at $15 a month for 10,000 ([pricing](https://postmarkapp.com/pricing)). The free tier is too small for one busy week.
- **Amazon SES direct** (the engine under PostHog and Resend): `Raw` MIME gives full control, including a hand-built `multipart/alternative` with the exact calendar part ([SendEmail](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html)). Cost is account setup, production access and building the MIME in Convex. Not smaller than Resend.

## Recommendation

1. Keep Workflows for Welcome Mail and Tips. Nothing changes for them.
2. Send the calendar mail from Convex through Resend, one call per Account per Session change, reusing the existing action retrier and `.test`/actor/opt-out rules.
3. Run the live test below before the spec is written. If `content_type` with a `method` parameter does not survive, Postmark is the fallback with a documented recipe.
4. Treat Google's default settings as a delivery risk to grill, not as solved.

## Needs a live test

1. Does Resend keep `text/calendar; charset=utf-8; method=REQUEST` (and `CANCEL`) intact? Read the raw source.
2. Do Gmail, Outlook.com and iCloud show an invite card for a Resend mail with one attachment? With an inline copy as well? For `REQUEST` and for `PUBLISH`?
3. Does Gmail add the event to the calendar by itself from an unknown `hello@next-session.link`, at each of the three "Add invitations" settings? What does the Gmail default do for a fresh account?
4. Does a `CANCEL` with the same `UID` and a higher `SEQUENCE` remove the entry in each client?

## Open questions for the decision tickets

- **Does the invite replace the Session update mail** for Claimed Accounts? Two mails per change (invite and Session update) would double the volume (spec §12.6). If the invite replaces it, the Session updates workflow, its My groups switch and the ADR-0011 Session amendments need revising.
- **`REQUEST` or `PUBLISH`?** `REQUEST` needs `ATTENDEE` and invites RSVP replies to an organizer with no inbox; `PUBLISH` does not. Which one clients treat better is the live test.
- **Organizer address.** One generic `hello@` (Google advises against it) or one per Group / GM? Per-GM addresses need domain-level routing we do not have. `hello@next-session.link` has no inbox (README), so replies and RSVPs bounce.
- **Which Resend account and plan** owns the `send` / `resend._domainkey` records? Is the quota shared with Lonir?
- **Time zones.** `DTSTART` needs a zone or UTC; the Group's start time and zone come from the Group settings work. A `VTIMEZONE` block is required if a zone is used ([RFC 5546 §3.2.2](https://datatracker.ietf.org/doc/html/rfc5546)).
- **Players without an Account** get the ICS download, not mail (the map's Destination). That download and a mailed invite should share one `.ics` builder.
