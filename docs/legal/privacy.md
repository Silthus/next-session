# Privacy Policy

> **Draft, pending review by a qualified German lawyer before publication.** Source text for the `/privacy` page. `{{…}}` placeholders are filled at build time (see `docs/spec.md` §7).

**Version 1.5. Effective: {{EFFECTIVE_DATE}}**

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
| Pseudonymous usage events (pages viewed, steps such as creating a link, joining, scheduling), with the random ID of your user, player, or group | Learn which parts of the Service are used, fix problems | Legitimate interest, 6(1)(f) |
| Error reports and technical logs (error message, browser, page) | Keep the Service working | Legitimate interest, 6(1)(f) |
| For an account: your email address | Send you one welcome mail | Contract, 6(1)(b) |
| For a player with an account, when session emails are enabled: your email address, group name, session date, share link and email preference | Tell you when a session is set or cancelled | Contract, 6(1)(b) |
| If you ask for tips: your email address and your confirmation | Send the two tip mails | Consent, 6(1)(a) |

Player names are whatever the GM or the player types in. A first name or nickname is enough. We do not need, and ask you not to enter, anything else about a person.

We measure use without cookies and without storing anything on your device. We show no ads and do no cross-site tracking, we do not combine your usage events with data from our other products, and we do not sell data or use it for automated decisions.

To count visitors, PostHog forms a hash of your IP address and browser with a secret that changes every day. It does not store your IP address. Share links and sign-in codes are removed from page addresses before they are sent, so a group's share link never reaches usage measurement. When session emails are enabled, PostHog receives the share link as mail content through a separate, secret-guarded workflow, not as a usage event or person property.

## 3. Storage on your device (§ 25 TDDDG)

The Service stores the following in your browser's local storage and session storage. All of it is strictly necessary for a function you asked for, so no consent is needed:

- your sign-in tokens, once you sign in;
- a save or a group you asked to keep, until it goes through or you close the tab;
- which player you are in each group, so you do not have to pick your name again;
- small display preferences, such as a dismissed hint;
- that you turned off usage measurement in this browser, if you did.

Apart from remembering that you turned it off, usage measurement stores nothing on your device and sets no cookies, so the list above is complete. From your device, it sends only the page address, the page you came from, and your browser's user agent, which names your browser and its version, your operating system, and your device. The script also looks at your screen size, time zone, and language, and drops them before anything is sent.

We set cookies only while you continue with Google: short-lived sign-in cookies that protect the round trip to Google and expire within 15 minutes. They are strictly necessary for the sign-in you asked for.

When you continue with Google, Google processes your sign-in under its own privacy policy. We receive only the data listed in section 2.

## 4. Recipients

We use these processors under data processing agreements (Art. 28 GDPR):

| Processor | Purpose | Location |
| --- | --- | --- |
| Convex, Inc. | Database, application backend, sign-in | USA |
| Cloudflare, Inc. | Delivering the website, protection against attacks | Global network, USA |
| PostHog Inc. | Usage measurement, error reports, technical logs, and sending the welcome mail, tips, and session updates when enabled | EU (Frankfurt) hosting, US company |

Transfers to the USA rely on the EU–US Data Privacy Framework and the EU Standard Contractual Clauses.

Everyone who has a group's share link can see that group's name, its player names, its scheduled dates, and its answers. That is how the Service works; see the Terms.

## 5. How long we keep data

| Data | Retention |
| --- | --- |
| A group without an account, with its players and answers | Deleted after 30 days without activity |
| An account and its groups | Until you ask us to delete them |
| A group, player, or answer you delete | Deleted at once; removed from backups within the providers' backup cycles |
| Server logs at our hosting providers | According to the providers' log retention, typically up to 30 days |
| Usage events and error reports in PostHog | 1 year |
| Technical logs in PostHog | 14 days |
| Your account's pseudonymous profile in PostHog, and your email address for the welcome mail, tips, and session updates | Until your account is deleted |

When you save a group to an account, the group moves to the account and the temporary user ID is deleted.

## 6. Your rights

You have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20), and objection (Art. 21). Write to {{CONTACT_EMAIL}}; we answer within one month.

**You may object to usage measurement at any time.** While the Service measures use, this page ends with a **Turn off usage measurement in this browser** button. Press it, and the Service sends no usage events, error reports, or technical logs from that browser. At your request, the Service remembers the choice in your browser's local storage, and the button becomes **Turn it back on**. If your browser does not let the Service remember the choice, it lasts until you reload the page or leave the site. Steps such as creating a link, joining, or scheduling are recorded on our servers, so the button does not cover them. To object to those, write to {{CONTACT_EMAIL}}; for an account, we then stop them for good.

When session emails are enabled, you can stop them with the unsubscribe link in each update or the "Email me when a session is set or cancelled" switch on My groups. The switch stores your preference on your account. A hosted unsubscribe still applies if you turn the switch back on. Session updates carry no open or click tracking.

You may withdraw your consent to the tips at any time, with the unsubscribe link in every tip or by replying to it. Mails sent before you withdraw stay lawful.

You may complain to a supervisory authority. Ours is the Bavarian State Office for Data Protection Supervision (BayLDA), <https://www.lda.bayern.de>.

## 7. Children

The Service is not directed at children under 16.

## 8. Changes

We may update this policy. We will tell account holders about material changes in the Service.
