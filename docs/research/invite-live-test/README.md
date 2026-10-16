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

To fill in. One row per question and client; evidence goes in this folder as redacted screenshots or MIME excerpts (addresses removed).

| Question                                                          | Gmail | Outlook.com | iCloud |
| ----------------------------------------------------------------- | ----- | ----------- | ------ |
| 1. `method=REQUEST` / `CANCEL` reach the inbox unchanged (raw MIME) |       |             |        |
| 2a. Invite card for `REQUEST` with `ATTENDEE`                     |       |             |        |
| 2b. Invite card for `PUBLISH`                                     |       |             |        |
| 3. Entry added without a tap (Google setting: …)                  |       |             |        |
| 4a. `SEQUENCE` 1 moves the entry                                  |       |             |        |
| 4b. `CANCEL` removes or marks the entry cancelled                 |       |             |        |
| 5. `VALARM` imported as a 2-hour reminder                         |       |             |        |
| 6. Location and Berlin time (CEST and CET) shown correctly        |       |             |        |
