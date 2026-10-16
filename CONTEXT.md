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

**Time and place**:
A Group's usual start time, length, time zone and location. A new Group starts at 19:00 for 4 hours, in the time zone of the GM's browser (Berlin time for Groups from before), with no location. A Session follows it unless it has its own start time, length or location. Saving it moves every upcoming scheduled Session in players' calendars.
_Avoid_: settings (in copy), event details, venue, all-day

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
A date the GM picked for the Group to play. It is scheduled or cancelled, and a Group has at most one Session per date, cancelled ones included. A scheduled Session whose date has passed was played.
_Avoid_: event, appointment, game, scheduled session

**Cancel** / **Cancelled Session**:
The GM calling off a Session after the Undo window, and the Session that results. It stays on its date marked Cancelled, so players and their calendars learn the night is off, and it never counts as played. **Schedule again** restores the same Session until the date passes. A Session cancelled inside its Undo window leaves no trace.
_Avoid_: unschedule, delete, remove (a Session)

**Undo window**:
The 30 seconds after the GM schedules or cancels a Session, in which Undo reverts the change and nobody is told about it.
_Avoid_: grace period, delay

**Best Nights**:
The top three dates of the visible month that no Player answered busy, ranked by how many are free, with maybe counting half.
_Avoid_: top days, recommendations

**Fill Rest**:
A Player's action that answers busy for every unanswered date left in the month.
_Avoid_: mark all, bulk no

**Calendar download**:
The one-time `.ics` copy of a Group's upcoming scheduled Sessions that **Add to calendar** on the player page gives anyone holding the Share Link. It shows each Session as it stood after its last Undo window and doesn't follow later changes. Rotating the Share Token stops its link.
_Avoid_: export, ICS link (in copy)

**Calendar feed**:
The secret link `next-session.link/cal/a/<feed token>.ics` that an Account subscribes to in its calendar app. It follows every Session of the Groups the Account runs or plays in, from the past month to the end of the Booking Window, and shows a Cancelled Session as cancelled. It carries no Share Token. **Reset feed link** gives a new link and stops the old one at once, with no Undo.
_Avoid_: webcal, iCal link, sync, subscription link (in copy)

### Legal

**Legal Acceptance**:
The record that a GM agreed to the Terms and the Privacy Policy: both document versions and a timestamp. The click on "Create your link", or creating an Account, is the act.
_Avoid_: consent (that word is reserved for Tips), clickwrap

### Mail and measurement

**Welcome Mail**:
The one email every new Account gets right after it is created, confirming the Account and linking My groups. It is part of the Service, not advertising.
_Avoid_: onboarding email, confirmation email

**Session updates**:
Emails to the GM's Account and the Accounts behind a Group's Claimed Players when a Session is set, changed or cancelled, each carrying a calendar invite. The GM who made the change gets one too, written as "you". The Session emails switch on My groups stops them.
_Avoid_: alerts, reminders (a Reminder is its own email), invite email

**Reminder**:
An email to the Account behind a Claimed Player, 1 day and again 2 hours before a scheduled Session starts. Reminders are on by default. The link in every Reminder and the Reminders switch on My groups stop them, and neither touches Session updates. A Cancelled Session reminds nobody, and a Reminder is never sent once its time has passed. Calendar entries from Next Session carry no reminder of their own, though the player's calendar app may add one.
_Avoid_: notification, alert, calendar alarm

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
- Lonir stored `scheduled | played | cancelled`. Next Session stores only scheduled or cancelled; played follows from the date.
- "Claim" means two things in code. The Save **claim code** (`saveClaims`) moves an Anonymous GM's Groups; a **Claim** links a Player to an Account. In copy, the first is "Save" and the second is "Keep this group".
