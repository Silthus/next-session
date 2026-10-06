# Privacy Policy

> **Draft, pending review by a qualified German lawyer before publication.** Source text for the `/privacy` page. `{{…}}` placeholders are filled at build time (see `docs/spec.md` §7).

**Version 1.3. Effective: {{EFFECTIVE_DATE}}**

This policy explains which personal data Next Session ("the Service") processes, why, and what rights you have under the GDPR.

## 1. Controller

Michael Reichenbach
{{CONTROLLER_ADDRESS}}
{{CONTACT_EMAIL}}

We have not appointed a data protection officer because we are not required to.

## 2. What we process

| Data | Purpose | Legal basis (GDPR Art. 6) |
| --- | --- | --- |
| For a group created without an account: a random user ID and the time you accepted the Terms | Run your group and prove your acceptance | Contract, 6(1)(b) |
| For an account with a password: your email address and a hash of your password | Let you sign in on any device | Contract, 6(1)(b) |
| For an account with Google: your email address, whether Google verified it, and your Google account ID, which Google sends us when you continue with Google | Let you sign in on any device | Contract, 6(1)(b) |
| For a player with an account: which player in which group belongs to your account | Show your groups on any device | Contract, 6(1)(b) |
| Group names, player names, the days players marked as free, maybe, or busy, and the scheduled dates | Provide the Service to the GM and the group | Contract, 6(1)(b) |
| Technical connection data (IP address, browser, time) in server logs of our hosting providers | Deliver the site and keep it secure | Legitimate interest, 6(1)(f) |
| Pseudonymous usage events (pages viewed, steps such as creating a link, joining, scheduling), with the random ID of your account, player, or group | Learn which parts of the Service are used, fix problems | Legitimate interest, 6(1)(f) |
| Error reports and technical logs (error message, browser, page) | Keep the Service working | Legitimate interest, 6(1)(f) |
| For an account: your email address | Send you one welcome mail | Contract, 6(1)(b) |
| If you ask for tips: your email address and your confirmation | Send the two tip mails | Consent, 6(1)(a) |

Player names are whatever the GM or the player types in. A first name or nickname is enough. We do not need, and ask you not to enter, anything else about a person.

We measure use without cookies and without storing anything on your device. We do not use advertising or cross-site tracking, we do not combine this data with data from other services, and we do not sell data or use it for automated decisions.

To count visitors without cookies, PostHog forms a hash of your IP address and browser with a secret that changes every day. It does not store your IP address. Page addresses are shortened before they are sent, so a group's share link never reaches PostHog.

## 3. Storage on your device (§ 25 TDDDG)

The Service stores the following in your browser's local storage and session storage. All of it is strictly necessary for a function you asked for, so no consent is needed:

- your sign-in tokens, once you sign in;
- a save or a group you asked to keep, until it goes through or you close the tab;
- which player you are in each group, so you do not have to pick your name again;
- small display preferences, such as a dismissed hint;
- that you turned off usage measurement in this browser, if you did.

Usage measurement stores nothing on your device and sets no cookies, so the list above is complete. It reads only what your browser sends with every request anyway: the page address, the page you came from, and your browser's name, version, and operating system.

We set cookies only while you continue with Google: short-lived sign-in cookies that protect the round trip to Google and expire within 15 minutes. They are strictly necessary for the sign-in you asked for.

When you continue with Google, Google processes your sign-in under its own privacy policy. We receive only the data listed in section 2.

## 4. Recipients

We use these processors under data processing agreements (Art. 28 GDPR):

| Processor | Purpose | Location |
| --- | --- | --- |
| Convex, Inc. | Database, application backend, sign-in | USA |
| Cloudflare, Inc. | Delivering the website, protection against attacks | Global network, USA |
| PostHog Inc. | Usage measurement, error reports, logs, and sending the account emails | EU (Frankfurt) hosting, US company |

Transfers to the USA rely on the EU–US Data Privacy Framework and the EU Standard Contractual Clauses.

Everyone who has a group's share link can see that group's name, its player names, its scheduled dates, and its answers. That is how the Service works; see the Terms.

## 5. How long we keep data

| Data | Retention |
| --- | --- |
| A group without an account, with its players and answers | Deleted after 30 days without activity |
| An account and its groups | Until you ask us to delete them |
| A group, player, or answer you delete | Deleted at once; removed from backups within the providers' backup cycles |
| Server logs at our hosting providers | According to the providers' log retention, typically up to 30 days |
| Usage events and error reports in PostHog | **Placeholder, to be filled in before usage measurement starts:** the event retention of our PostHog plan |
| Technical logs in PostHog | 14 days |
| Your email address in PostHog, for the welcome mail and tips | Until your account is deleted |

When you save a group to an account, the group moves to the account and the temporary user ID is deleted.

## 6. Your rights

You have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20), and objection (Art. 21). Write to {{CONTACT_EMAIL}}; we answer within one month.

**You may object to usage measurement at any time.** In your browser, press **Turn off usage measurement in this browser** at the end of this page: the Service then sends no usage events, error reports, or logs from that browser. To stop the events we record on our servers for your account, write to {{CONTACT_EMAIL}}.

You may withdraw your consent to the tips at any time, with the unsubscribe link in every tip or by replying to it. Mails sent before you withdraw stay lawful.

You may complain to a supervisory authority. Ours is the Bavarian State Office for Data Protection Supervision (BayLDA), <https://www.lda.bayern.de>.

## 7. Children

The Service is not directed at children under 16.

## 8. Changes

We may update this policy. We will tell account holders about material changes in the Service.
