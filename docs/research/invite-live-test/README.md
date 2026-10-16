# Calendar invite live test (#129)

Throwaway branch for ticket #129 of map #120. No PR, never merged. No key, address or raw mail is committed here: secrets and inboxes live only in `~/.config/next-session/invite-test.env` on the devbox.

## What exists (2026-10-16)

- **DNS.** `next-session.link` holds Resend's records: `resend._domainkey` (DKIM), `send` (CNAME to Resend's `forge.rmta.net` return path with SPF and a feedback MX) and `rsend`. `_dmarc` is `p=none`. So the domain is set up in some Resend account.
- **Not on this devbox:** a Resend API key, `~/.config/next-session/` and any test inbox. GitHub Actions secrets hold no Resend key, and the repo has no Convex deployment configured locally.
- **Resend's calendar handling.** The REST docs take `attachments[].content_type`. Resend's .NET example sends `text/calendar` content as plain text, and its Laravel transport passes a `text/calendar` body unencoded. Neither shows a `method` parameter, so the test sends both base64 and plain-text content.

## The test mails

`send.ts` builds each mail by hand (`ics.ts`) and sends it through `POST https://api.resend.com/emails` with one `invite.ics` attachment, `content_type: text/calendar; charset=utf-8; method=<METHOD>`.

| Step             | METHOD  | UID       | SEQUENCE | Start (Berlin), run 2026-10-16 |
| ---------------- | ------- | --------- | -------- | ------------------------------ |
| `request`        | REQUEST | `…-request` | 0      | Sat 24.10. 19:00 (CEST)        |
| `request-move`   | REQUEST | same      | 1        | Sat 31.10. 19:30 (CET)         |
| `request-cancel` | CANCEL  | same      | 2        | as moved, `STATUS:CANCELLED`   |
| `publish`        | PUBLISH | `…-publish` | 0      | Sun 25.10. 18:00 (CET)         |
| `publish-move`   | PUBLISH | same      | 1        | Sun 1.11. 18:30 (CET)          |
| `publish-cancel` | CANCEL  | same      | 2        | as moved, `STATUS:CANCELLED`   |

Every invite has `LOCATION:Musterstraße 1, 50667 Köln, Deutschland`, `TZID=Europe/Berlin` with a full `VTIMEZONE`, and a `VALARM` 120 minutes before. 120 minutes is no client's default, so a 2-hour reminder means the alarm was imported. The `REQUEST` track names the inbox as `ATTENDEE` with `RSVP=FALSE`; the `PUBLISH` track has no attendee. Dates follow the run date (`--run`, default today): the first Saturday at least a week later, so a run near late October also crosses the DST change.

## Michael's checklist

1. **Resend.** In the Resend account that owns `next-session.link` (Domains shows it Verified), create an API key with **Sending access** for that domain only.
2. **Env file** on the devbox, never in chat or the repo:

   ```sh
   mkdir -p ~/.config/next-session && chmod 700 ~/.config/next-session
   cat > ~/.config/next-session/invite-test.env <<'EOF'
   RESEND_API_KEY=re_...
   INVITE_TO=<gmail address>,<outlook.com address>,<icloud address>
   EOF
   chmod 600 ~/.config/next-session/invite-test.env
   ```

3. **Google setting.** Google Calendar on the web → Settings → General → Event settings → **Add invitations to my calendar**. Note the value; do not change it yet.
4. Look at each inbox and calendar after every round below and fill in the results table. iCloud: the iPhone or Mac Calendar app, since iCloud.com shows less.

## Runbook

From the repo root, with the run date fixed for all rounds (`RUN=$(date +%F)` once):

```sh
ENV=~/.config/next-session/invite-test.env
# 0. Raw MIME through a disposable mail.tm inbox: answers question 1, no personal inbox
bun --env-file $ENV docs/research/invite-live-test/send.ts mime-check --run $RUN
# 1. Round one: new Sessions
bun --env-file $ENV docs/research/invite-live-test/send.ts request --run $RUN
bun --env-file $ENV docs/research/invite-live-test/send.ts publish --run $RUN
# look, record, then 2. Round two: moves
bun --env-file $ENV docs/research/invite-live-test/send.ts request-move --run $RUN
bun --env-file $ENV docs/research/invite-live-test/send.ts publish-move --run $RUN
# look, record, then 3. Round three: cancels
bun --env-file $ENV docs/research/invite-live-test/send.ts request-cancel --run $RUN
bun --env-file $ENV docs/research/invite-live-test/send.ts publish-cancel --run $RUN
```

`--dry-run` prints the payload and the calendar without a key. `--content text` sends the calendar as plain text instead of base64. Mail count: 4 for `mime-check`, 2 per inbox per round, so 22 for three inboxes, well under Resend's free 100 a day.

Optional second Google pass: if the setting in step 3 is not **Only if the sender is known**, switch to it, run `request` with a new `--run`, record, and switch back.

## Results

Filled in round by round. Evidence goes in this folder as redacted screenshots or MIME excerpts (addresses removed). The third inbox is a Microsoft (Outlook) account on a custom domain in place of Outlook.com.

**Resend side (`mime-check`, 2026-10-16, [evidence](mime-check-2026-10-16.md)).** Resend keeps the full `Content-Type: text/calendar; charset=utf-8; method=REQUEST` (and `PUBLISH`, `CANCEL`), adds `name=invite.ics`, and sends the part base64 with `Content-Disposition: attachment`. The structure is `multipart/mixed` holding `multipart/alternative` (text, html), then the calendar. The calendar decodes byte for byte to what was sent, with CRLF line ends, whether the API got base64 or plain text. Mail goes out through SES `eu-west-1`, DKIM `d=next-session.link`, return path on `rsend.next-session.link`. The key Michael created has sending access only, so delivery status is read in the inboxes, not the API.

**Round 1 (invite, sent 2026-10-16 08:44 Berlin), Michael's first report.** He wrote: "in my calendar only the 24.10. appeared automatically". His phone screenshot (kept private, not committed; it shows no address) is a unified "Inbox" in one mail app holding four mails from "Next Session": two `request` and two `publish`, so two of the three inboxes are in that view.

- **`REQUEST` with `ATTENDEE`:** both copies show an invite card, "Sat 24. Oct, 19:00 (4h)" with an **RSVP** button. The card comes from that mail app. The 19:00 start and 4-hour length match the CEST time sent. Spieleabend A (24.10.) landed in his calendar with no tap.
- **`PUBLISH`:** both copies show only a paperclip, an `invite.ics` attachment with no card. Spieleabend B (25.10.) did not land in his calendar.
- The mail app is **Notion Mail** (a unified inbox over several accounts), and the calendar is **Notion Calendar**.

**Round 1 follow-up (Michael, 2026-10-16).**

- **Outlook auto-adds.** The third inbox is a Microsoft (Outlook) account on a custom domain. Michael: "It showed up in my Outlook calendar, not Gmail." The entry "has the address, and it has the reminder 2 hours before."
- **The 2-hour reminder is almost certainly ours.** MS-OXCICAL §2.1.3.1.1.20.62 ([spec](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcical/a685a040-5b69-4c84-b084-795113fb4012)) says a duration `TRIGGER` "MUST" set `PidLidReminderDelta` to its minutes. Outlook's own default reminder is 15 minutes, and 120 is not a usual default. It stays ambiguous only if Michael's Outlook default is 2 hours.
- **Gmail does not auto-add.** The setting is "only if the sender is known", and the invite was not added, as Google's docs predict for an unknown sender.
- **RSVP fails.** Michael tried to accept from Notion Calendar and got an error, "Failed. Not yet sure if we…" (truncated). The invite already carries `RSVP=FALSE`, so that flag does not hide the button. The cause is not determined. Two candidates:
  - The event was not in Google Calendar, so Notion Calendar had nothing to answer through the Google API.
  - A reply would go to `hello@next-session.link`, which has no MX at all (the zone has none), so it bounces.
- **iCloud:** not reported, untested.
- **Decision (Michael):** "I would say we are good to go": the `REQUEST` path is approved. The `PUBLISH` track is dropped. Rounds 2 and 3 run for `REQUEST` only.

**Round 2 (move, `SEQUENCE:1`, sent 2026-10-16 08:57 Berlin).** Spieleabend A moves from Sat 24.10. 19:00 (CEST) to Sat 31.10. 19:30 (CET). Michael, dictated: "Yes, it moved in Gmail. It didn't auto-edit, but it also didn't change the setting."

- **Conductor's reading:** in Outlook, the entry moved by itself. In Gmail, the entry was never added, because the setting stayed "only if the sender is known", so there was nothing to move.
- **Literal reading:** Gmail moved an entry Michael never added.
- The round 3 park asks which one is right.

**Round 3 (cancel, `METHOD:CANCEL`, `SEQUENCE:2`, `STATUS:CANCELLED`, sent 2026-10-16 09:20 Berlin).** Result pending.

### Options for the failing RSVP (for the architecture prototype)

1. **`PARTSTAT=ACCEPTED` with `RSVP=FALSE` on the player's `ATTENDEE`.** The entry arrives already "going", and many clients then show no answer prompt. It costs nothing and is untested.
2. **Give the organizer address a mailbox that accepts mail.** For example Cloudflare Email Routing on `next-session.link` (the zone is on Cloudflare; no MX today) with a drop or forward rule. A `METHOD:REPLY` from any client then arrives instead of bouncing. It costs one MX and one rule. Replies carry the player's address, so drop them, or name them in the Privacy Policy.
3. **Leave it, and say "no reply needed" in the mail.** This is the cheapest option, but the failing button stays.

Recommendation: 1 and 2 together, with 1 checked in the architecture prototype's own live send. RSVP sync stays out of scope; this only stops a button from failing or a reply from bouncing.

| Question | Gmail (Notion Mail / Calendar) | Outlook, custom domain (Notion Mail / Calendar) | iCloud |
| --- | --- | --- | --- |
| 1. `method=` intact (raw MIME) | Resend side yes ([evidence](mime-check-2026-10-16.md)); the client renders the card | same; card renders | untested |
| 2a. Card for `REQUEST` with `ATTENDEE` | Yes, with RSVP; accepting from Notion Calendar failed | Yes, with RSVP | untested |
| 2b. Card for `PUBLISH` | No, attachment only | No, attachment only | untested |
| 3. Added without a tap | No (setting "only if the sender is known") | Yes | untested |
| 4a. `SEQUENCE` 1 moves the entry | unclear: likely nothing to move (never added), see round 2 | Yes, by itself (conductor's reading) | untested |
| 4b. `CANCEL` removes or marks the entry cancelled | pending (round 3) | pending (round 3) | untested |
| 5. `VALARM` imported as a 2-hour reminder | n/a (not added) | Yes, 2 hours; almost certainly the `VALARM` (see above) | untested |
| 6. Location and Berlin time | 19:00 (4h) on the card | Address and time shown; CET after the move pending | untested |
