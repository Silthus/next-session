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
A GM who can sign in again on any device, today with an email and a password.
_Avoid_: real user, registered user, profile

**Player**:
A name on a Group's Roster. A Player never signs in; whoever holds the Share Link can answer as any Player.
_Avoid_: member, membership, participant, attendee

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
_Avoid_: consent (that word is reserved for analytics), clickwrap

## Relationships

- A **GM** owns zero or more **Groups**; an **Anonymous GM** owns at least one.
- A **Group** has one **Share Link**, one **Roster**, and many **Sessions**.
- A **Player** belongs to exactly one **Group** and gives at most one **Answer** per date.
- **Save** turns the **Unsaved Groups** of an **Anonymous GM** into Groups of an **Account**, and the Anonymous GM ends.

## Flagged ambiguities

- Lonir called a roster entry a "Membership" and stored answers as `yes / maybe / no` while the UI said Free / Maybe / Busy. Next Session uses **Player** and **free / maybe / busy** everywhere, in code and in copy.
- Lonir split "Scheduled Session" (a date) from "Session" (prep content). Next Session has no prep content, so **Session** is the picked date.
