# Next Session

Next Session schedules tabletop game nights. A GM shares one link with their group, players mark the days they can play, and the GM picks the date.

## Language

### People

**GM**:
The person who owns a Group and picks its Sessions. A GM is a signed-in user, either an Anonymous GM or an Account.
_Avoid_: owner (in copy), admin, organizer

**Anonymous GM**:
A GM created by the one click on "Create your link", with no email and no password. An Anonymous GM exists only while it owns at least one Group.
_Avoid_: guest, temporary user

**Account**:
A signed-in user who can sign in again on any device, today with an email and a password. One Account can be a GM, a Player, or both: it owns Groups and claims Players.
_Avoid_: real user, registered user, profile, player account

**Player**:
A name on a Group's Roster. A Player needs no Account; whoever holds the Share Link can answer as any Player. A Player stays on the Roster until the GM removes them or the Group ends.
_Avoid_: member, membership, participant, attendee

**Claimed Player**:
A Player linked to an Account, so the Account opens the Group as that Player on any device and sees the Group on My groups. An Account claims at most one Player per Group. A claim adds no protection: the Share Link still answers as any Player.
_Avoid_: linked player, player account, membership

**Claim** / **Release**:
Linking a Player to the signed-in Account, and undoing that link. Joining with a new name while signed in claims; **Keep this group** claims an existing name. **Not you?** and **Remove from my groups** release. Releasing never deletes the Player.
_Avoid_: adopt, unlink, leave (only the GM removes a Player)

**My groups**:
The Account's page (`/me`): the Groups it runs and the Groups where it has a Claimed Player, each with its upcoming Sessions.
_Avoid_: dashboard, home, profile

### Groups

**Group**:
One table of people who play together: one GM, a Roster, Answers, and Sessions.
_Avoid_: space, campaign, workspace, team

**Roster**:
The Players of one Group. The GM adds names, and Players add themselves through the Share Link.
_Avoid_: member list, participants

**Share Link**:
The URL `next-session.link/s/<Share Token>` that opens a Group's player surface. It is the only credential a Player needs.
_Avoid_: invite link, player link (in code), magic link

**Share Token**:
The unguessable part of the Share Link. Rotating it gives the Group a new Share Link and stops the old one.
_Avoid_: slug, code, invite code

**Unsaved Group**:
A Group owned by an Anonymous GM. It expires after 30 days without activity.
_Avoid_: draft group, temporary group

**Save**:
Moving every Group of an Anonymous GM to an Account. The Share Link stays the same, and an Account's existing Groups are never touched.
_Avoid_: upgrade, convert, link account, merge (in copy)

**Expiry**:
The moment an Unsaved Group is deleted for inactivity. Any GM or Player activity on the Group pushes it out again.
_Avoid_: TTL, timeout, cleanup date

### Scheduling

**Answer**:
One Player's reply for one date: free, maybe, or busy. A date without an Answer is unanswered.
_Avoid_: availability (for a single reply), vote, response, yes/no

**Booking Window**:
The dates that can be answered or scheduled: from today to the end of the month two months after the current one. Dates before today are read-only.
_Avoid_: range, horizon

**Session**:
A date the GM picked for the Group to play. A Group has at most one Session per date.
_Avoid_: event, appointment, game, scheduled session

**Best Nights**:
The top three dates of the visible month that no Player answered busy, ranked by how many are free, with maybe counting half.
_Avoid_: top days, recommendations

**Fill Rest**:
A Player's action that answers busy for every unanswered date left in the month.
_Avoid_: mark all, bulk no

### Legal

**Legal Acceptance**:
The record that a GM agreed to the Terms and the Privacy Policy: both document versions and a timestamp. The click on "Create your link", or creating an Account, is the act.
_Avoid_: consent (that word is reserved for Tips), clickwrap

### Mail and measurement

**Welcome Mail**:
The one email every new Account gets right after it is created, confirming the Account and linking My groups. It is part of the Service, not advertising.
_Avoid_: onboarding email, confirmation email

**Session updates**:
Emails to the Accounts behind a Group's Claimed Players when a Session is set or cancelled, excluding the actor. The Account preference on My groups and the hosted unsubscribe both stop them. Implementation ships disabled until live activation.
_Avoid_: alerts, reminders (these do not remind before a Session)

**Tips**:
Two short emails on getting the first game night scheduled, sent only to an Account that ticked the box in the Save sheet and then pressed **Yes, send me the tips** on the page the Welcome Mail links to. Unsubscribing stops them.
_Avoid_: drip, newsletter, marketing (in copy)

**Product Marker**:
The `product: "next-session"` property on every event, exception and log Next Session sends to PostHog, which shares its project with Lonir.
_Avoid_: app tag, source

## Relationships

- A **GM** owns zero or more **Groups**; an **Anonymous GM** owns at least one.
- A **Group** has one **Share Link**, one **Roster**, and many **Sessions**.
- A **Player** belongs to exactly one **Group** and gives at most one **Answer** per date.
- An **Account** has at most one **Claimed Player** per **Group**; a **Player** is claimed by at most one **Account**.
- **Save** turns the **Unsaved Groups** of an **Anonymous GM** into Groups of an **Account**, and the Anonymous GM ends.

## Flagged ambiguities

- Lonir called a roster entry a "Membership" and stored answers as `yes / maybe / no` while the UI said Free / Maybe / Busy. Next Session uses **Player** and **free / maybe / busy** everywhere, in code and in copy.
- Lonir split "Scheduled Session" (a date) from "Session" (prep content). Next Session has no prep content, so **Session** is the picked date.
- "Claim" means two things in code. The Save **claim code** (`saveClaims`) moves an Anonymous GM's Groups; a **Claim** links a Player to an Account. In copy, the first is "Save" and the second is "Keep this group".
