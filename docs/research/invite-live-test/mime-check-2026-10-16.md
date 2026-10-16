# `mime-check` evidence, 2026-10-16

Four mails sent through Resend to a disposable mail.tm inbox: `request` with base64 content, `request` with plain-text content, `publish` and `request-cancel`. Raw sources are kept privately on the devbox; this excerpt removes every address.

## MIME skeleton (`request`, identical for the others apart from `method=`)

```
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="--_NmP-…-Part_1"

----_NmP-…-Part_1
Content-Type: multipart/alternative;
 boundary="--_NmP-…-Part_2"

----_NmP-…-Part_2
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

----_NmP-…-Part_2
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

----_NmP-…-Part_2--

----_NmP-…-Part_1
Content-Type: text/calendar; charset=utf-8; method=REQUEST; name=invite.ics
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename=invite.ics

----_NmP-…-Part_1--
```

| Mail | Calendar `Content-Type` received | Decoded calendar |
| --- | --- | --- |
| `request`, base64 upload | `text/calendar; charset=utf-8; method=REQUEST; name=invite.ics` | 1162 bytes, 44 CRLF lines, `METHOD:REQUEST`, `SEQUENCE:0` |
| `request`, plain-text upload | same | identical to the base64 upload |
| `publish` | `text/calendar; charset=utf-8; method=PUBLISH; name=invite.ics` | `METHOD:PUBLISH`, no `ATTENDEE` |
| `request-cancel` | `text/calendar; charset=utf-8; method=CANCEL; name=invite.ics` | `METHOD:CANCEL`, `SEQUENCE:2`, `STATUS:CANCELLED`, no `VALARM` |

`LOCATION:Musterstraße 1\, 50667 Köln\, Deutschland`, `DTSTART;TZID=Europe/Berlin:…`, the `VTIMEZONE` and `TRIGGER:-PT120M` arrive unchanged.

## Transport

- `Received: from a3-13.smtp-out.eu-west-1.amazonses.com`
- `DKIM-Signature: … s=resend; d=next-session.link; h=From:To:Subject:Message-ID:Date:MIME-Version:Content-Type`
- `Return-Path: <…@rsend.next-session.link>`

## Open

mail.tm's source view shows the first line after each opening boundary joined to the boundary line (no CRLF); later boundaries are clean. That is most likely mail.tm's rendering. Gmail's **Show original** for the round-1 `request` mail settles it.
