# Calendar delivery for Sessions

Research for ticket [#121](https://github.com/Silthus/next-session/issues/121) of map [#120](https://github.com/Silthus/next-session/issues/120). Read on 2026-10-16. Throwaway branch, never merged.

Question: which delivery puts a Session into a player's calendar, keeps it updated when the night moves or is Cancelled, and needs no explicit onboarding from the GM or the player?

Vocabulary: a Session is "a calendar entry" here. "Event" appears only where it is the name in a provider's API or spec.

How to read the evidence: **Stated** means a primary source says it, with a link. **Silent** means the primary source I read does not say it. **Not verified** means I know of no primary source and the behaviour needs a test with real clients. Where a number comes from a non-primary source I say so.

## Short answer

No option reaches every player with zero action on both sides. They differ in who must act and when.

| | Who acts once | What reaches the player |
|---|---|---|
| (a) Google Calendar API, GM-owned calendar | The GM grants an OAuth scope | Native Google invites and updates |
| (a') Google Calendar API, Next Session-owned calendar | Nobody, but invitations are subject to each guest's invitation setting | Native for Google guests, iMIP mail for others |
| (b) iMIP mail | Nobody, subject to the same invitation setting in Gmail | A mail with a `text/calendar` part, updated by `UID` + `SEQUENCE` |
| (c) Subscription feed | Each Account subscribes once | Entries on the client's refresh schedule |

(b) is the only option that can reach an Account that never opened a settings page. Its weak point is that nothing in the sources I read guarantees the entry lands without a tap: Google's own documentation says an invitation from a sender the guest does not know waits for a click. (c) is the only option that fully removes the mail dependency, but the player must subscribe once, and refresh lag is hours. (a) with a GM-owned calendar is ruled out by the map's no-onboarding note.

## (a) Google Calendar API

### Scopes

Google lists these Calendar scopes, with these descriptions ([scope reference](https://developers.google.com/identity/protocols/oauth2/scopes)):

- `calendar.app.created`: "Make secondary Google calendars, and see, create, change, and delete events on them"
- `calendar.events`: "View and edit events on all your calendars"
- `calendar.events.owned`: "See, create, change, and delete events on Google calendars you own"

`events.insert` accepts any of `calendar`, `calendar.events`, `calendar.app.created` and `calendar.events.owned` ([events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)).

`calendar.app.created` is the narrowest: it covers only secondary calendars the app creates. `calendar.events` reaches every calendar the GM has.

**Sensitivity of each scope: Silent.** Neither the [Calendar scope page](https://developers.google.com/workspace/calendar/api/auth) nor the scope reference labels any Calendar scope as non-sensitive, sensitive or restricted. Google says the Cloud Console's Data Access page sorts scopes into those tiers ([consent screen guide](https://developers.google.com/workspace/calendar/api/guides/auth)). Third-party sources call `calendar` and `calendar.events` sensitive, and none I found classify `calendar.app.created`. The Console must be checked before a decision.

### Verification cost

Google defines three tiers and the reviews each needs ([consent screen guide](https://developers.google.com/workspace/calendar/api/guides/auth)):

| Tier | Basic verification | Additional verification | Security assessment |
|---|---|---|---|
| Non-sensitive | yes | no | no |
| Sensitive | yes | yes | no |
| Restricted | yes | yes | yes |

For a sensitive scope ([sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)):

- Review "typically takes 3-5 business days".
- Required: verified ownership of the authorized domains in Search Console, a public home page, a privacy policy on the same domain that discloses how Google user data is accessed, used, stored and shared, a published branding status, a written justification per scope, and an unlisted YouTube demo video of the consent flow.
- Cost: Silent. The page names no fee.
- Unverified apps hit a user cap on Google Accounts that can grant access. The number is Silent. Apps in Testing status also get a limited refresh-token lifetime.

The privacy policy under `docs/legal/` would need a Google user data section before submission.

### Does it work without the GM granting anything?

Two shapes:

- **GM-owned calendar.** The GM must grant a scope. That is explicit onboarding and the map rules it out.
- **Next Session-owned calendar.** A Google account Next Session controls creates the entries and adds players as guests. No GM or player grants a scope. The owner account grants once, and the app must not stay in Testing status, because of the limited refresh-token lifetime above. Service accounts cannot populate the attendee list without domain-wide delegation ([events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)), so a regular owner account is the shape that fits. Whether Google restricts or flags one account that invites many unrelated people is Silent.

### Invitation behaviour

Per [Invite users to an event](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events):

- The entry always lands on the organizer's calendar. The invitation comes from the organizer's address.
- Guests have an invitation setting with three values: add from everyone; add only if the sender is known; add only when the user responds in the mail. "Known" means the guest interacted with the organizer before, shares an organization, or has the organizer in Contacts. Otherwise the guest must click **Add to calendar** or answer Yes or Maybe.
- Forcing the entry onto a guest's calendar needs write access to the guest's calendar. That is a per-player grant.
- The page offers one no-grant workaround: the guest adds the organizer's address to Google Contacts first.
- The default value of the setting is Silent.

So (a') does not escape the "known sender" rule. A player with the common setting sees an unanswered invitation until they click.

### Moves and cancellation

- A change by the organizer propagates to guests ([same page](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events)).
- `sendUpdates` takes `all`, `externalOnly` (non-Google guests) and `none`. Google warns that `none` "can stop events from syncing to external calendars or cause them to be lost" ([events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)).
- What a cancelled entry looks like to a Google guest and to a non-Google guest: Silent.

### Carried fields and reminders

- Start time and time zone: `start.dateTime` with `start.timeZone` as an IANA name ([events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)).
- `location` is free text. A URL goes in `location` or `description`; a dedicated field is Silent in the pages I read.
- Reminders: `reminders.useDefault` and up to 5 `overrides` of `email` or `popup`, 0 to 40320 minutes. The event resource describes them as "Information about the event's reminders for the authenticated user" ([Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events)). The invitation guide lists reminders among private properties: "The attendee's own settings control them, not the organizer's calendar". **The sender cannot set a reminder the guest receives.** A guest gets their own calendar's defaults.

### Player without a Google account

Google sends invitation mail to non-Google guests when `sendUpdates` is `all` or `externalOnly`. The documentation shown does not describe the content of that mail. Treat it as (b) with Google as the sender: Apple Calendar and Outlook behaviour from the (b) section applies, and the sender is Google's, so the sender caveats in (b) are moot but the guest still sees "organizer = the owner account".

## (b) iCalendar invitations by mail (iMIP)

### Protocol

- A `text/calendar` part must carry a `method` MIME parameter equal to the iCalendar `METHOD` property, and a charset of UTF-8 when non-ASCII ([RFC 6047 §2.4](https://datatracker.ietf.org/doc/html/rfc6047)).
- Updates reuse the `UID`. The recipient treats an unknown `UID` as new; a known `UID` with a higher `SEQUENCE` is a reschedule; `DTSTAMP` breaks ties ([RFC 5546 §2.1.5, §3.2.2](https://datatracker.ietf.org/doc/html/rfc5546)). `SEQUENCE` must increase when `DTSTART`, `DTEND`, `DURATION`, `RRULE`, `RDATE`, `EXDATE` or `STATUS` change ([§2.1.4](https://datatracker.ietf.org/doc/html/rfc5546)).
- Cancel: `METHOD:CANCEL` with the same `UID`, an incremented `SEQUENCE`, `DTSTAMP`, `ORGANIZER`, and `STATUS:CANCELLED` for a whole-entry cancel ([RFC 5546 §3.2.5](https://datatracker.ietf.org/doc/html/rfc5546)). A cancel must not carry `VALARM`.
- The `From` address need not equal the `ORGANIZER`; the organizer is read from the calendar part ([RFC 6047 §2](https://datatracker.ietf.org/doc/html/rfc6047)). A no-reply `From` is allowed by the RFC.
- RFC 6047 §2.2.2 says "Authentication MUST be performed using S/MIME". Which clients enforce it on unsigned mail from a sender like Next Session: Silent / Not verified.
- Replies go to the `ORGANIZER` address. With a no-reply organizer, an RSVP goes nowhere. The map puts RSVP sync out of scope. Whether setting `RSVP=FALSE` on the `ATTENDEE` stops clients from offering reply buttons: Not verified.

### Gmail and Google Calendar

[Google's guide](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events) documents sending invitations by `.ics` mail directly:

- Use a "unique, static email address for each organizer"; do not use a generic address like `invitation@example.com`, because abuse "could affect everyone sending from it".
- Setting handling is the three-value rule above. A sender the guest does not know leaves the invitation waiting for **Add to calendar** or an answer.
- Updates and cancellations by `.ics`: **Silent.** The page says nothing about `SEQUENCE`, `CANCEL` or removal. RFC 5546 defines them; Gmail's behaviour is Not verified.

This changes the sender design: a single no-reply address works against Google's advice. A per-Group sender address (a unique, static one per organizer) is what the guide describes.

### Apple Mail and Calendar

- Apple's page says: "Open the event attachment to add the event to Calendar", then respond from Notifications ([Send and receive invitations](https://support.apple.com/guide/calendar/send-and-receive-invitations-to-events-icl1016/mac)). Nothing says the entry appears on its own.
- Updates, cancellations and sender requirements: **Silent.** Exchange accounts in Mail show Accept, Decline, Maybe, and OK for cancelled entries ([Mail guide](https://support.apple.com/en-hk/guide/mail/mlhleed80167/mac)), which is about Exchange accounts, not arbitrary senders.

### Outlook and Exchange

- In Exchange, "the default value for user mailboxes is AutoUpdate, but you can't change the value on a user mailbox". `AutoUpdate` means the Calendar Attendant processes meeting requests and responses ([Set-CalendarProcessing](https://learn.microsoft.com/en-us/powershell/module/exchange/set-calendarprocessing)). So Exchange-hosted mailboxes process requests server-side and put them in the calendar tentatively. The page does not say whether that applies to an invitation from an external, non-Exchange sender; Not verified.
- Cancellations: the Outlook client has a setting to remove cancelled meetings automatically ("Automatically accept meeting requests and remove canceled meetings"), and by default a cancelled meeting stays visible. I know this from community answers on Microsoft Q&A, not from an official page; treat as Not verified.

### Carried fields and reminders

- `DTSTART` with `TZID` needs a matching `VTIMEZONE`; UTC with `Z` needs none ([RFC 5545 §3.2.19](https://datatracker.ietf.org/doc/html/rfc5545)). A floating time is read as local time on each device, which is wrong for a table meeting abroad. Use UTC or `TZID` + `VTIMEZONE`.
- `LOCATION` is text for the venue ([§3.8.1.7](https://datatracker.ietf.org/doc/html/rfc5545)). `URL` is a property of `VEVENT`.
- `VALARM` is allowed (0 or more) in a `REQUEST` ([RFC 5546 §3.2.2](https://datatracker.ietf.org/doc/html/rfc5546)). RFC 5545 says delivering an alarm is "typically the responsibility of a Calendar User Agent". Whether Gmail/Google Calendar, Apple or Outlook import the alarm of a received invitation: **Silent / Not verified.** Google's rule above (reminders are the attendee's own) suggests Google ignores it.

### Players without a Google account

Apple and Outlook players are served by the `.ics` part and their own client rules above. No account is needed to receive mail.

### Sender in this repo

[Spec §12.6](../spec.md) sends Session updates through PostHog Workflows. The Workflows email documentation ([configure channels](https://posthog.com/docs/workflows/configure-channels)) is **Silent** on attachments, custom MIME parts, `text/calendar`, custom headers and reply-to. It names one From name per channel, set when the channel is created. So a calendar part is unproven there and a per-Group sender would mean a channel per Group. Resend's send API supports `attachments` with `content_type`, custom `headers` and `reply_to` but is Silent on calendar invitations ([Resend send email](https://resend.com/docs/api-reference/emails/send-email)). Neither sender is confirmed for a proper `multipart/alternative` with a `text/calendar; method=REQUEST` body part; that needs a live test.

## (c) Personal subscription feed per Account

### Format

- Serve one iCalendar object at a secret URL and leave `METHOD` out. `DTSTART` is "REQUIRED in `VEVENT` calendar components contained in iCalendar objects that don't specify the `METHOD` property" ([RFC 5545 §3.8.2.4](https://datatracker.ietf.org/doc/html/rfc5545)).
- One feed can hold every Group of the Account. An iCalendar object holds any number of `VEVENT` components, each with its own `UID`, `LOCATION` and `URL`. No source I read forbids it, and per-Group colour/name needs `COLOR` per entry ([RFC 7986 §5.9](https://datatracker.ietf.org/doc/html/rfc7986)), whose client support is Not verified.
- `REFRESH-INTERVAL` is a "suggested minimum interval for polling" and "Clients SHOULD honor" it ([RFC 7986 §5.7, §5.8](https://datatracker.ietf.org/doc/html/rfc7986)). Whether Google, Apple or Outlook honour it: **Silent.**
- A Cancelled Session: either drop the `VEVENT` or serve `STATUS:CANCELLED` ([RFC 5545 §3.8.1.11](https://datatracker.ietf.org/doc/html/rfc5545)). How each client treats a vanished or cancelled entry in a subscription: Silent / Not verified.

### Refresh intervals

| Client | What the primary source says |
|---|---|
| Google Calendar | No interval. The [help page for adding by URL](https://support.google.com/calendar/answer/37100) is Silent. A [Google Calendar Community thread](https://support.google.com/calendar/thread/131946190/webcal-calendar-is-not-updated-by-google) (not an official statement) reports updates within 24 hours counting as working and moves not propagating. Adding by URL is a computer-web action; the help page describes the **From URL** flow on a computer |
| Apple Calendar | Subscribed calendars "can be refreshed automatically" through an **Auto-refresh** menu, per calendar. The page lists no intervals ([Refresh calendars](https://support.apple.com/en-my/guide/calendar/icl1024/mac)). The iPhone pages were not readable |
| Outlook.com | "Approximately every 3 hours", and "can take more than 24 hours" ([Microsoft](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web)) |
| Outlook on the web | "Approximately every 6 hours", same caveat (same page) |

An imported `.ics` file is a one-time snapshot in Outlook (same page).

### Fields and reminders

Start time, time zone, `LOCATION` and `URL` ride on each `VEVENT` as in (b). `VALARM` in a feed: Silent for Google and Outlook. Apple's Auto-refresh and subscription pages as read do not mention alarms; Not verified.

### Players without a Google account

A secret URL needs an Account to exist. A player without an Account gets the same iCalendar content as a one-time ICS download, which is the destination's fallback.

## Comparison

| | (a) Google API, GM-owned | (a') Google API, Next Session-owned | (b) iMIP mail | (c) Feed |
|---|---|---|---|---|
| Action before first entry | GM grants OAuth scope | Guest's invitation setting decides; "known sender" may mean a click | Same Gmail rule; Apple: open the attachment; Exchange: processed server-side | Each Account subscribes once; Google needs a computer to add |
| Google verification | Needed; cost Silent; 3-5 business days | Owner account only; Testing status limits tokens | None | None |
| Moves | Propagated natively | Propagated natively; mail to non-Google guests | `UID` + higher `SEQUENCE`; client behaviour Not verified | Next client refresh: hours, up to a day |
| Cancel | Native | Native | `METHOD:CANCEL`; Outlook keeps it visible by default (unofficial) | Drop the `VEVENT` or `STATUS:CANCELLED`; client behaviour Not verified |
| Start, time zone | Carried | Carried | Carried with `TZID`+`VTIMEZONE` or UTC | Carried |
| `LOCATION` and URL | `location`; URL in text | Same | Both properties | Both properties |
| Sender-set reminders | No: private to the guest | No | `VALARM` allowed by RFC; client use Not verified | `VALARM` allowed; client use Not verified |
| No Google account | Not served | Google mails them an invite | Fully served | Served after subscribing |
| Mail volume | One invite per guest from Google | Same | One mail per Session change per Account, on the shared quota in spec §12.6 | None |
| Works for an Account that does nothing | No | Partly | Yes, subject to client rules | No |

## Recommendation (the architecture prototype decides)

1. Start with **(b)** as the push path, because only it reaches an Account that never opened a settings page and it covers Apple and Outlook players that (a') would reach through Google's mail anyway. Test first, with a sandbox account in each of Gmail, Apple Mail and Outlook: does a `METHOD:REQUEST` from an unknown sender land without a tap, does a higher `SEQUENCE` move it, does `METHOD:CANCEL` remove it, and is `VALARM` honoured.
2. Build **(c)** next to it, because the ICS download for players without an Account needs the same iCalendar generation, and the feed is the self-heal path when mail is missed, filtered or declined. It costs no mail volume.
3. **Drop (a) with a GM-owned calendar** (it needs a grant, and verification) and treat (a') as a fallback only: it adds Google verification work and does not remove the "known sender" click that (b) also has.

Reminders cannot be promised from the sender side in any option. Copy must not say "we remind you".

## Open questions for the decision tickets

- Can PostHog Workflows send a `text/calendar` part, or does the mail need another sender such as Resend? Spec §12.6 chose Workflows; ADR-0011 records it.
- A per-Group sender address (Google's guidance) against one shared address: mail domain, DNS and quota consequences.
- Account email is unverified for Password sign-ups (spec §5.3). An invitation or a feed bound to an unverified address mails strangers. Does calendar delivery wait for email verification?
- Whether to set `RSVP=FALSE` and what the organizer address is when replies are out of scope.
- What the feed holds when the GM changes the Group's usual time, and how a Cancelled Session appears.
- Secret feed URL rotation and revocation, next to Share Token rotation (ADR-0004).
- Privacy Policy rows for calendar delivery and, if (a') is chosen, a Google user data section.
- `calendar.app.created` sensitivity tier: read it in the Cloud Console before anyone relies on (a').
- Real-client behaviour for the Not verified cells above.

## Sources read

RFC [5545](https://datatracker.ietf.org/doc/html/rfc5545), [5546](https://datatracker.ietf.org/doc/html/rfc5546), [6047](https://datatracker.ietf.org/doc/html/rfc6047), [7986](https://datatracker.ietf.org/doc/html/rfc7986); Google [scopes](https://developers.google.com/identity/protocols/oauth2/scopes), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events), [inviting attendees](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events), [sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [subscribe help](https://support.google.com/calendar/answer/37100); Apple [Calendar invitations](https://support.apple.com/guide/calendar/send-and-receive-invitations-to-events-icl1016/mac), [Refresh calendars](https://support.apple.com/en-my/guide/calendar/icl1024/mac); Microsoft [subscribe to a calendar](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web), [Set-CalendarProcessing](https://learn.microsoft.com/en-us/powershell/module/exchange/set-calendarprocessing); PostHog [channels](https://posthog.com/docs/workflows/configure-channels); Resend [send email](https://resend.com/docs/api-reference/emails/send-email).

Pages were read through a fetch tool that summarises them, so quotes are as that tool returned them. Gaps: Apple's subscribe pages and iPhone pages did not load their bodies; Apple Mail's cancellation handling and Gmail's `CANCEL` handling are not documented in any page I read.
