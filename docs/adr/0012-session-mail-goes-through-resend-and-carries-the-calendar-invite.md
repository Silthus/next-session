# Session mail goes through Resend and carries the calendar invite

Session mail (a Session set, changed or cancelled) goes from Convex through Resend, from `Next Session <calendar@next-session.link>`. The Session update is the body and an iMIP invite (`METHOD:REQUEST` or `CANCEL`, built by `shared/icalendar`) is its calendar part, so one mail per change puts the night into the reader's calendar, moves it and takes it out. It goes to the GM's Account and to every Account behind a Claimed Player. Reminders, the Welcome Mail and Tips stay in PostHog Workflows (ADR-0011).

PostHog Workflows can't attach a calendar part (#122), and a Session update plus a second mail with the invite would double every change. Splitting by job also splits the two 100-a-day quotas, which keeps the largest volume (Reminders) away from the invites. #129 proved the passthrough live: Outlook adds, moves and removes the entry with no tap, Gmail needs one tap on **Add to calendar**.

This reverses ADR-0011's amendment of 2026-10-07, which put Session updates on Workflows. The architecture is the [calendar sync architecture](https://github.com/Silthus/next-session/blob/246ab34/docs/architecture/calendar-sync.md) (#126), and the design is `docs/spec.md` §15.

## Considered Options

- **Keep the Workflows Session update and send a second mail with the invite.** No change to #102's live path, but two mails per change.
- **Move all mail to Resend.** One provider, but the double opt-in Tips, their templates and their hosted unsubscribe would move too.
- **Postmark** as the sender. The fallback if Resend stops passing `text/calendar; method=…` through unchanged.

## Consequences

- Session mail copy lives in code (`convex/model/sessionMailCopy.ts`), not in the Workflows editor.
- `calendar@next-session.link` is the sender and the `ORGANIZER`. An Email Routing rule drops replies, so the mail says replies aren't read, and every `ATTENDEE` arrives accepted with `RSVP=FALSE`.
- The GM's Account now gets Session mail too, worded as "you".
- It ships disabled: without `RESEND_API_KEY` the Workflows Session update runs as before. With the key set, Resend carries Session mail and the Workflows Session update is not requested, so a change never mails twice. Once the switch-on is proven live, the Workflows Session update is deleted.
- Mail volume is counted and warned per provider.
